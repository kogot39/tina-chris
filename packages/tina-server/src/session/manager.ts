import fs from 'fs'
import path from 'path'
import { safeFilename } from '@tina-chris/tina-util'

import type {
  AssistantMessage,
  Message as ContextMessage,
  StopReason,
  Usage,
} from '@mariozechner/pi-ai'

import { createEmptyUsage } from '@/llm'

export type SessionTextMessageStatus =
  | 'pending'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'aborted'

export type SessionToolMessageStatus =
  | 'calling'
  | 'complete'
  | 'error'
  | 'aborted'

export type SessionDisplayMessageType =
  | 'user'
  | 'assistant'
  | 'speech_text'
  | 'reasoning'
  | 'tool'

export type SessionContextRole =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'tool'
  | 'none'

export type SessionDisplayMessageMetadata = {
  // turnId 是“一个 pi-ai context message”的重组边界。
  // 一轮用户输入里可能出现多次 assistant -> toolResult -> assistant，
  // 所以这里不能把整轮对话复用同一个 id，否则历史恢复时会把多个 assistant 合并错。
  turnId?: string
  contextRole?: SessionContextRole
  blockIndex?: number
  toolCallId?: string
  toolName?: string
  api?: string
  provider?: string
  model?: string
  usage?: Usage
  stopReason?: StopReason
  errorMessage?: string
  isError?: boolean
  [key: string]: unknown
}

type SessionTextDisplayMessage = {
  id: string
  type: Exclude<SessionDisplayMessageType, 'tool'>
  content: string
  status: SessionTextMessageStatus
  timestamp: number
}

type SessionToolDisplayMessage = {
  id: string
  type: 'tool'
  content: string
  status: SessionToolMessageStatus
  timestamp: number
  toolName: string
  parameters?: unknown
  result?: unknown
  error?: string
}

// 这里显式镜像 packages/tina-ui/src/types/message.ts，而不是从包入口导入。
// 原因有两个：
// 1. tina-ui 包入口在正常消费时指向 dist d.ts，本地重构期间 dist 可能滞后于源码。
// 2. session JSONL 是 tina-server 负责持久化的协议，直接把结构写在这里更利于审查。
export type SessionDisplayMessage = (
  | SessionTextDisplayMessage
  | SessionToolDisplayMessage
) & {
  metadata?: SessionDisplayMessageMetadata
}

export type SessionMessagesPage = {
  items: SessionDisplayMessage[]
  // cursor 是下一次分页读取时的“结束序号”（exclusive）。
  // 初次读取使用 messages.length，返回最新 limit 条；继续向上翻时传 nextCursor。
  nextCursor: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const toRecord = (value: unknown): Record<string, any> => {
  return isRecord(value) ? (value as Record<string, any>) : {}
}

const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  if (value == null) {
    return ''
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const getTurnId = (message: SessionDisplayMessage): string => {
  const turnId = message.metadata?.turnId
  return typeof turnId === 'string' && turnId ? turnId : message.id
}

const getBlockIndex = (
  message: SessionDisplayMessage,
  fallback: number
): number => {
  const blockIndex = message.metadata?.blockIndex
  return typeof blockIndex === 'number' && Number.isFinite(blockIndex)
    ? blockIndex
    : fallback
}

const getStopReason = (
  metadata: SessionDisplayMessageMetadata | undefined,
  status: SessionTextMessageStatus | SessionToolMessageStatus
): StopReason => {
  if (
    metadata?.stopReason === 'stop' ||
    metadata?.stopReason === 'length' ||
    metadata?.stopReason === 'toolUse' ||
    metadata?.stopReason === 'error' ||
    metadata?.stopReason === 'aborted'
  ) {
    return metadata.stopReason
  }

  if (status === 'error') return 'error'
  if (status === 'aborted') return 'aborted'
  return 'stop'
}

type AssistantGroupItem = {
  message: SessionDisplayMessage
  order: number
}

type AssistantGroup = {
  turnId: string
  items: AssistantGroupItem[]
}

const getAssistantBaseMetadata = (
  group: AssistantGroup
): SessionDisplayMessageMetadata => {
  return (
    group.items.find((item) => item.message.metadata?.api)?.message.metadata ||
    group.items[0]?.message.metadata ||
    {}
  )
}

const buildAssistantContextMessages = (
  group: AssistantGroup
): ContextMessage[] => {
  const ordered = group.items.slice().sort((a, b) => {
    const indexA = getBlockIndex(a.message, a.order)
    const indexB = getBlockIndex(b.message, b.order)
    return indexA === indexB ? a.order - b.order : indexA - indexB
  })
  const metadata = getAssistantBaseMetadata(group)
  const content: AssistantMessage['content'] = []
  const seenToolCalls = new Set<string>()

  for (const { message } of ordered) {
    const role = message.metadata?.contextRole

    if (message.type === 'assistant' || role === 'assistant') {
      if (message.content) {
        content.push({ type: 'text', text: message.content })
      }
      continue
    }

    if (message.type === 'reasoning' || role === 'reasoning') {
      if (message.content) {
        content.push({ type: 'thinking', thinking: message.content })
      }
      continue
    }

    if (message.type !== 'tool' && role !== 'tool') {
      continue
    }

    const toolCallId =
      typeof message.metadata?.toolCallId === 'string'
        ? message.metadata.toolCallId
        : ''
    if (!toolCallId || seenToolCalls.has(toolCallId)) {
      continue
    }

    seenToolCalls.add(toolCallId)
    content.push({
      type: 'toolCall',
      id: toolCallId,
      name:
        typeof message.metadata?.toolName === 'string'
          ? message.metadata.toolName
          : message.type === 'tool'
            ? message.toolName
            : 'unknown_tool',
      arguments: message.type === 'tool' ? toRecord(message.parameters) : {},
    })
  }

  if (content.length === 0) {
    return []
  }

  const first = ordered[0]?.message
  const assistantMessage: AssistantMessage = {
    role: 'assistant',
    content,
    api: typeof metadata.api === 'string' ? metadata.api : 'openai-completions',
    provider:
      typeof metadata.provider === 'string' ? metadata.provider : 'tina',
    model: typeof metadata.model === 'string' ? metadata.model : 'unknown',
    usage: isRecord(metadata.usage)
      ? (metadata.usage as AssistantMessage['usage'])
      : createEmptyUsage(),
    stopReason: getStopReason(metadata, first?.status ?? 'complete'),
    errorMessage:
      typeof metadata.errorMessage === 'string'
        ? metadata.errorMessage
        : undefined,
    timestamp: first?.timestamp ?? Date.now(),
  }

  const contextMessages: ContextMessage[] = [assistantMessage]
  const seenToolResults = new Set<string>()

  for (const { message } of ordered) {
    if (message.type !== 'tool' || message.status === 'calling') {
      continue
    }

    const toolCallId =
      typeof message.metadata?.toolCallId === 'string'
        ? message.metadata.toolCallId
        : ''
    if (!toolCallId || seenToolResults.has(toolCallId)) {
      continue
    }

    seenToolResults.add(toolCallId)
    const isError =
      message.metadata?.isError === true || message.status === 'error'
    const resultText = toText(
      isError
        ? (message.error ?? message.result)
        : (message.result ?? message.error)
    )

    // tool 展示消息本身已经包含 toolName/parameters/result/error。
    // 重建 pi-ai toolResult 时只从这些展示字段和最小 metadata 取值，
    // 避免在 JSONL 里再复制一整份 ContextMessage。
    contextMessages.push({
      role: 'toolResult',
      toolCallId,
      toolName:
        typeof message.metadata?.toolName === 'string'
          ? message.metadata.toolName
          : message.toolName,
      content: [{ type: 'text', text: resultText || message.content }],
      details: message.result,
      isError,
      timestamp: message.timestamp,
    })
  }

  return contextMessages
}

const buildContextMessages = (
  messages: SessionDisplayMessage[]
): ContextMessage[] => {
  const contextMessages: ContextMessage[] = []
  let currentAssistantGroup: AssistantGroup | null = null

  const flushAssistantGroup = () => {
    if (!currentAssistantGroup) {
      return
    }

    contextMessages.push(
      ...buildAssistantContextMessages(currentAssistantGroup)
    )
    currentAssistantGroup = null
  }

  messages.forEach((message, order) => {
    const role = message.metadata?.contextRole

    if (message.type === 'user' || role === 'user') {
      flushAssistantGroup()
      contextMessages.push({
        role: 'user',
        content: message.content,
        timestamp: message.timestamp,
      })
      return
    }

    if (
      message.type === 'assistant' ||
      message.type === 'reasoning' ||
      message.type === 'tool' ||
      role === 'assistant' ||
      role === 'reasoning' ||
      role === 'tool'
    ) {
      const turnId = getTurnId(message)
      if (currentAssistantGroup?.turnId !== turnId) {
        flushAssistantGroup()
        currentAssistantGroup = { turnId, items: [] }
      }

      currentAssistantGroup.items.push({ message, order })
      return
    }

    // speech_text 等展示辅助消息不进入 pi-ai context。
  })

  flushAssistantGroup()
  return contextMessages
}

export class Session {
  constructor(
    public readonly key: string,
    public messages: SessionDisplayMessage[] = [],
    public readonly createdAt: number = Date.now(),
    public updatedAt: number = Date.now(),
    public metadata: Record<string, any> = {}
  ) {}

  addMessage(message: SessionDisplayMessage): void {
    this.messages.push(message)
    this.updatedAt = Date.now()
  }

  addMessages(messages: SessionDisplayMessage[]): void {
    if (messages.length === 0) {
      return
    }

    this.messages.push(...messages)
    this.updatedAt = Date.now()
  }

  getHistory(): ContextMessage[] {
    const start = this.getUnsummarizedStart()
    // getHistory() 是展示格式 -> pi-ai Context 的唯一入口。
    // 不再读取旧 role/content JSONL，也不尝试兼容旧 OpenAI schema；
    // JSONL 里只保存桌面展示消息，context 在这里按最小 metadata 重组。
    return buildContextMessages(this.messages.slice(start))
  }

  getUnsummarizedMessages(): SessionDisplayMessage[] {
    return this.messages.slice(this.getUnsummarizedStart())
  }

  clear(): void {
    this.messages = []
    this.updatedAt = Date.now()
  }

  getMessagesPage(cursor?: number | null, limit = 50): SessionMessagesPage {
    const safeLimit = Math.max(1, Math.floor(limit) || 50)
    const rawEnd =
      typeof cursor === 'number' && Number.isFinite(cursor)
        ? Math.floor(cursor)
        : this.messages.length
    const end = Math.max(0, Math.min(this.messages.length, rawEnd))
    const start = Math.max(0, end - safeLimit)

    return {
      items: this.messages.slice(start, end),
      nextCursor: start > 0 ? start : null,
    }
  }

  private getUnsummarizedStart(): number {
    const summarizedCount =
      typeof this.metadata.memorySummaryMessageCount === 'number'
        ? this.metadata.memorySummaryMessageCount
        : 0

    // memorySummaryMessageCount 记录“前多少条展示消息已经被摘要覆盖”。
    // 这里夹取边界，避免手动编辑 metadata 后导致 slice 越界。
    return Math.max(0, Math.min(this.messages.length, summarizedCount))
  }
}

export class SessionManager {
  private sessionsDir: string
  private cache = new Map<string, Session>()

  constructor(workspacePath: string) {
    this.sessionsDir = path.join(workspacePath, 'sessions')
    fs.mkdirSync(this.sessionsDir, { recursive: true })
  }

  getOrCreate(key: string): Session {
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }

    const session = this.load(key) || new Session(key)
    this.cache.set(key, session)
    return session
  }

  getMessagesPage(
    key: string,
    cursor?: number | null,
    limit = 50
  ): SessionMessagesPage {
    return this.getOrCreate(key).getMessagesPage(cursor, limit)
  }

  save(session: Session): void {
    const sessionPath = this.getSessionPath(session.key)
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true })

    const metadataLine = {
      _type: 'metadata',
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      metadata: session.metadata,
    }

    const lines = [
      JSON.stringify(metadataLine),
      ...session.messages.map((message) => JSON.stringify(message)),
    ]

    fs.writeFileSync(sessionPath, `${lines.join('\n')}\n`, 'utf-8')
    this.cache.set(session.key, session)
  }

  delete(key: string): boolean {
    this.cache.delete(key)

    const sessionPath = this.getSessionPath(key)
    if (!fs.existsSync(sessionPath)) {
      return false
    }

    fs.unlinkSync(sessionPath)
    return true
  }

  listSessions(): Array<Record<string, unknown>> {
    if (!fs.existsSync(this.sessionsDir)) {
      return []
    }

    return fs
      .readdirSync(this.sessionsDir)
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => this.readSessionSummary(file))
      .filter((item): item is Record<string, unknown> => item !== null)
      .sort((a, b) => {
        const aTime = Date.parse(String(a.updatedAt || '')) || 0
        const bTime = Date.parse(String(b.updatedAt || '')) || 0
        return bTime - aTime
      })
  }

  private getSessionPath(key: string): string {
    const safeKey = safeFilename(key.replace(/:/g, '_'))
    return path.join(this.sessionsDir, `${safeKey}.jsonl`)
  }

  private load(key: string): Session | null {
    const sessionPath = this.getSessionPath(key)
    if (!fs.existsSync(sessionPath)) {
      return null
    }

    try {
      const lines = fs
        .readFileSync(sessionPath, 'utf-8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      const messages: SessionDisplayMessage[] = []
      let metadata: Record<string, any> = {}
      let createdAt = Date.now()
      let updatedAt = Date.now()

      for (const line of lines) {
        const data = JSON.parse(line)
        if (data._type === 'metadata') {
          metadata = data.metadata || {}
          createdAt = this.parseTimestamp(data.createdAt)
          updatedAt = this.parseTimestamp(data.updatedAt)
          continue
        }

        // 旧格式不做迁移：用户会手动清理本地旧数据。
        // 这里按新展示消息结构直接载入，缺字段问题交给后续展示/摘要逻辑自然暴露。
        messages.push(data as SessionDisplayMessage)
      }

      return new Session(key, messages, createdAt, updatedAt, metadata)
    } catch {
      return null
    }
  }

  private readSessionSummary(file: string): Record<string, unknown> | null {
    try {
      const sessionPath = path.join(this.sessionsDir, file)
      const firstLine = fs.readFileSync(sessionPath, 'utf-8').split(/\r?\n/)[0]
      if (!firstLine) {
        return null
      }

      const data = JSON.parse(firstLine)
      if (data._type !== 'metadata') {
        return null
      }

      return {
        key: path.basename(file, '.jsonl').replace(/_/g, ':'),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        path: sessionPath,
      }
    } catch {
      return null
    }
  }

  private parseTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }

    return Date.now()
  }
}
