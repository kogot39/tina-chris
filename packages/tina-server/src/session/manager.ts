import fs from 'fs'
import path from 'path'
import { safeFilename } from '@tina-chris/tina-util'

type SessionMessage = Record<string, any>

export class Session {
  constructor(
    public readonly key: string,
    public messages: SessionMessage[] = [],
    public readonly createdAt: number = Date.now(),
    public updatedAt: number = Date.now(),
    public metadata: Record<string, any> = {}
  ) {}

  // 添加一条消息到会话中，并更新修改时间戳
  addMessage(role: string, content: string, extra: Record<string, any> = {}) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      ...extra,
    })
    this.updatedAt = Date.now()
  }

  getHistory(maxMessages = 50): Array<Record<string, any>> {
    // 返回最近的 maxMessages 条消息，供构建上下文使用
    // 实际存储的消息可能包含更多轮历史，但通常模型上下文窗口有限，没必要全部加载。
    return this.messages.slice(-maxMessages).map((message) => ({
      role: message.role,
      content: message.content,
    }))
  }

  clear() {
    this.messages = []
    this.updatedAt = Date.now()
  }
}

export class SessionManager {
  private sessionsDir: string
  private cache = new Map<string, Session>()

  constructor(workspacePath: string) {
    // 会话记录以 JSONL 格式保存在 workspace/sessions 目录下，每个会话一个文件，文件名为 {key}.jsonl。
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

  save(session: Session) {
    const sessionPath = this.getSessionPath(session.key)
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true })

    // 第一行JSONL是一个轻量级的元数据封装。接下来的每一行代表一条聊天消息
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

  // 删除会话记录，包括内存缓存和磁盘文件
  delete(key: string): boolean {
    this.cache.delete(key)

    const sessionPath = this.getSessionPath(key)
    if (!fs.existsSync(sessionPath)) {
      return false
    }

    fs.unlinkSync(sessionPath)
    return true
  }

  // 列出所有会话记录的摘要信息，供前端展示会话列表使用
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
    // 为了避免文件系统不兼容的字符，使用 safeFilename 处理 key，替换掉冒号等特殊字符
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

      const messages: SessionMessage[] = []
      let metadata: Record<string, any> = {}
      let createdAt = Date.now()
      let updatedAt = Date.now()
      // 第一行应该是元数据，如果格式不对也没关系，继续往下解析消息内容
      for (const line of lines) {
        const data = JSON.parse(line)
        if (data._type === 'metadata') {
          metadata = data.metadata || {}
          createdAt = this.parseTimestamp(data.createdAt)
          updatedAt = this.parseTimestamp(data.updatedAt)
          continue
        }

        messages.push(data)
      }

      return new Session(key, messages, createdAt, updatedAt, metadata)
    } catch {
      // 如果文件损坏或格式不正确，返回 null 让调用方创建一个新的 Session
      return null
    }
  }
  // 读取会话文件的第一行，解析出会话摘要信息供列表展示使用，避免一次性加载整个会话历史造成性能问题
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
      // 从文件名中提取原始 key，反向替换 safeFilename 处理过的字符
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
