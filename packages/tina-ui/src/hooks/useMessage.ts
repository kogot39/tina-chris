import { shallowRef } from 'vue'

import type {
  AssistantMessage,
  Message,
  MessageType,
  ReasoningMessage,
  SpeechTextMessage,
  TextMessage,
  TextMessageStatus,
  ToolCallMessage,
  ToolMessageStatus,
  UserMessage,
} from '../types'

type TextType = Exclude<MessageType, 'tool'>
export type InitialMessage = Message extends infer TMessage
  ? TMessage extends Message
    ? Omit<TMessage, 'status'> & { status?: TMessage['status'] }
    : never
  : never

type AddTextMessageInput<TType extends TextType> = {
  id: string
  content: string
  status?: TextMessageStatus
  timestamp: number
  type?: TType
}

export type AddUserMessageInput = AddTextMessageInput<'user'>
export type AddAssistantMessageInput = AddTextMessageInput<'assistant'>
export type AddSpeechTextMessageInput = AddTextMessageInput<'speech_text'>
export type AddReasoningMessageInput = AddTextMessageInput<'reasoning'>

export type AddToolCallMessageInput = {
  id: string
  toolName: string
  parameters?: unknown
  content?: string
  timestamp: number
}

export type AddToolResultMessageInput = {
  id: string
  toolName?: string
  result?: unknown
  error?: string
  content?: string
  status?: ToolMessageStatus
  timestamp: number
}

const STREAM_END_CONTENT = 'END'

const appendText = (current: string, next: string): string => {
  if (!current) {
    return next
  }

  return `${current}${next}`
}

const normalizeInitialMessage = (message: InitialMessage): Message => {
  // session 恢复或外部初始化时允许省略 status；进入 UI 状态树后统一补成 complete，
  // 这样组件无需反复处理 undefined 状态。
  if (message.type === 'tool') {
    return {
      ...message,
      status: message.status ?? 'complete',
    }
  }

  return {
    ...message,
    status: message.status ?? 'complete',
  }
}

export function useMessage(initialMessages: InitialMessage[] = []) {
  const messages = shallowRef<Message[]>(
    initialMessages.map(normalizeInitialMessage)
  )

  const initMessages = (nextMessages: InitialMessage[]) => {
    messages.value = nextMessages.map(normalizeInitialMessage)
  }

  const prependMessages = (nextMessages: InitialMessage[]) => {
    if (nextMessages.length === 0) {
      return
    }

    const existingIds = new Set(messages.value.map((message) => message.id))
    const normalizedMessages = nextMessages
      .map(normalizeInitialMessage)
      .filter((message) => !existingIds.has(message.id))

    if (normalizedMessages.length === 0) {
      return
    }

    // 历史分页返回的 items 已经是时间正序；这里只做去重后整体插到前面，
    // 不和流式 upsert 复用，避免滚动加载旧消息时意外拼接到正在生成的消息上。
    messages.value = [...normalizedMessages, ...messages.value]
  }

  const clearMessages = () => {
    messages.value = []
  }

  const upsertTextMessage = <TMessage extends TextMessage>(
    type: TMessage['type'],
    input: AddTextMessageInput<TMessage['type']>
  ) => {
    const current = messages.value
    const targetIndex = current.findIndex((item) => item.id === input.id)
    // 兼容旧的流式结束约定：content='END' 只更新状态，不把 END 当正文追加。
    // 新 bus metadata 也会传 complete 状态，但保留这里可以让 hook 独立工作。
    const isStreamEnd = input.content === STREAM_END_CONTENT
    const status = isStreamEnd ? 'complete' : (input.status ?? 'complete')
    const content = isStreamEnd ? '' : input.content

    if (targetIndex >= 0) {
      const target = current[targetIndex]
      if (target.type !== type) {
        // 同一个 id 只能属于一种展示消息类型。这个保护能尽早暴露服务端
        // displayType/id 组合错误，避免 UI 静默把 assistant 内容拼到 tool 卡里。
        throw new Error(`Message id '${input.id}' is already used.`)
      }

      const nextMessage = {
        ...target,
        content: appendText(target.content, content),
        status,
        timestamp: input.timestamp,
      } as TMessage
      const next = current.slice()
      next[targetIndex] = nextMessage
      messages.value = next
      return
    }

    const nextMessage = {
      id: input.id,
      type,
      content,
      status,
      timestamp: input.timestamp,
    } as TMessage

    messages.value = [...current, nextMessage]
  }

  const addUserMessage = (message: AddUserMessageInput) => {
    upsertTextMessage<UserMessage>('user', message)
  }

  const addAssistantMessage = (message: AddAssistantMessageInput) => {
    upsertTextMessage<AssistantMessage>('assistant', message)
  }

  const addSpeechTextMessage = (message: AddSpeechTextMessageInput) => {
    upsertTextMessage<SpeechTextMessage>('speech_text', message)
  }

  const addReasoningMessage = (message: AddReasoningMessageInput) => {
    upsertTextMessage<ReasoningMessage>('reasoning', message)
  }

  const addToolCallMessage = (message: AddToolCallMessageInput) => {
    const current = messages.value
    const targetIndex = current.findIndex((item) => item.id === message.id)
    const content = message.content || `Calling ${message.toolName}`

    if (targetIndex >= 0) {
      const target = current[targetIndex]
      if (target.type !== 'tool') {
        throw new Error(`Message id '${message.id}' is already used.`)
      }

      const nextMessage: ToolCallMessage = {
        ...target,
        // 工具参数可能流式补全，同一个 id 反复 upsert 时用最新参数覆盖。
        toolName: message.toolName,
        parameters: message.parameters,
        content,
        status: 'calling',
        timestamp: message.timestamp,
      }
      const next = current.slice()
      next[targetIndex] = nextMessage
      messages.value = next
      return
    }

    messages.value = [
      ...current,
      {
        id: message.id,
        type: 'tool',
        toolName: message.toolName,
        parameters: message.parameters,
        content,
        status: 'calling',
        timestamp: message.timestamp,
      },
    ]
  }

  const addToolResultMessage = (message: AddToolResultMessageInput) => {
    const current = messages.value
    const targetIndex = current.findIndex((item) => item.id === message.id)
    const status: ToolMessageStatus =
      message.status ?? (message.error ? 'error' : 'complete')

    if (targetIndex >= 0) {
      const target = current[targetIndex]
      if (target.type !== 'tool') {
        throw new Error(`Message id '${message.id}' is already used.`)
      }

      const nextMessage: ToolCallMessage = {
        ...target,
        // 工具结果和调用使用同一个 id，最终卡片保留调用参数并补上 result/error。
        toolName: message.toolName || target.toolName,
        result: message.result,
        error: message.error,
        content: message.content || target.content,
        status,
        timestamp: message.timestamp,
      }
      const next = current.slice()
      next[targetIndex] = nextMessage
      messages.value = next
      return
    }

    messages.value = [
      ...current,
      {
        id: message.id,
        type: 'tool',
        toolName: message.toolName || 'unknown_tool',
        content: message.content || 'Tool result received.',
        result: message.result,
        error: message.error,
        status,
        timestamp: message.timestamp,
      },
    ]
  }

  return {
    messages,
    initMessages,
    prependMessages,
    clearMessages,
    addUserMessage,
    addSpeechTextMessage,
    addReasoningMessage,
    addAssistantMessage,
    addToolCallMessage,
    addToolResultMessage,
  }
}
