import type { Message } from '@tina-chris/tina-ui'

export type SessionDisplayMessage = Message & {
  // renderer 展示只依赖 Message 字段；metadata 保留给后续调试、context 重建审查、
  // 以及桌面端可能需要展示 provider/usage 等信息时使用。
  metadata?: Record<string, unknown>
}

export type GetSessionMessagesInput = {
  sessionKey?: string
  cursor?: number | null
  limit?: number
}

export type SessionMessagesPage = {
  items: SessionDisplayMessage[]
  nextCursor: number | null
}
