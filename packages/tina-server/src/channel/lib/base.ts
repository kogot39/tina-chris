export type ChannelStatus = {
  providerKey: string
  connected: boolean
  message: string
  updatedAt: string
}

export type ChannelInboundTextMessage = {
  chatId: string
  senderId: string
  content: string
  metadata?: Record<string, unknown>
}

export type ChannelInboundTextHandler = (
  message: ChannelInboundTextMessage
) => void

export const createChannelStatus = (
  providerKey: string,
  connected: boolean,
  message: string
): ChannelStatus => ({
  providerKey,
  connected,
  message,
  updatedAt: new Date().toISOString(),
})

// BaseChannel 只抽象“第三方聊天通道”和系统之间的最小契约。
// 具体 SDK 的登录、消息格式、会话路由和回复上下文都留在 provider 内部，
// 避免把某个平台的概念泄漏到 MessageBus 或 AgentLoop 中。
export abstract class BaseChannel {
  private inboundTextHandler: ChannelInboundTextHandler = () => {}

  setInboundTextHandler(handler: ChannelInboundTextHandler): void {
    this.inboundTextHandler = handler
  }

  protected emitInboundText(message: ChannelInboundTextMessage): void {
    this.inboundTextHandler(message)
  }

  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  abstract sendText(chatId: string, content: string): Promise<void>
  abstract getStatus(): ChannelStatus
}
