// 基本消息格式定义
export type MessageMetadata = Record<string, unknown>
export interface MessageInput {
  channel: string // 来源
  chatId: string // 消息 id
  senderId: string // 发送者 id
  timestamp?: number // 消息时间戳，默认为当前时间
  type?: string // 消息类型，例如 'text'、'image'、'file', 没有 type 默认为 'text'
  content?: string // 消息内容
  media?: string[] | ArrayBuffer // 附带的媒体资源（如图片、文件等），支持字符串数组或二进制数据
  metadata?: MessageMetadata // 附加元数据
}

export interface InboundMessageInput extends MessageInput {
  // 发送给内部的消息必须指定特定的发送目标，以此来区分不同的消息处理器，减少不必要的消息处理开销
  sendTo: string | string[] // 特定发送的目标
}

export interface OutboundMessageInput extends MessageInput {
  replyTo?: string | string[] // 特定回复的目标
}

// 基本消息格式
export class Message {
  public channel: string
  public chatId: string
  public senderId: string
  public timestamp: number
  public type: string
  public content: string
  public media: string[] | ArrayBuffer
  public metadata: MessageMetadata

  constructor({
    channel,
    chatId,
    senderId,
    timestamp = Date.now(),
    content = '',
    media = [],
    metadata = {},
    type = 'text',
  }: MessageInput) {
    this.channel = channel
    this.chatId = chatId
    this.senderId = senderId
    this.timestamp = timestamp
    this.content = content
    this.media = media
    this.metadata = metadata
    this.type = type
  }
}

// 外部消息格式
export class InboundMessage extends Message {
  public sendTo: string | string[]
  constructor({ sendTo, ...message }: InboundMessageInput) {
    super(message)
    this.sendTo = sendTo
  }

  // get 方便获取 session key
  get sessionKey(): string {
    // 生成一个唯一的 session key
    return `${this.channel}:${this.chatId}`
  }
}

// 内部 agent 消息格式
export class OutboundMessage extends Message {
  public replyTo?: string | string[]
  constructor({ replyTo, ...message }: OutboundMessageInput) {
    super(message)
    this.replyTo = replyTo
  }
}

// 部分内部使用 ws 长连接，可能需要特定消息开启和闭合连接
export class ConnectionStartMessage extends InboundMessage {
  constructor({ ...message }: InboundMessageInput) {
    super({ ...message, content: '__connection_start__' })
  }
}

export class ConnectionEndMessage extends InboundMessage {
  constructor({ ...message }: InboundMessageInput) {
    super({ ...message, content: '__connection_end__' })
  }
}
