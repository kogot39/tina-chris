import { randomUUID } from 'crypto'
import { Type } from '@mariozechner/pi-ai'
import {
  MessageBus,
  type MessageMetadata,
  OutboundMessage,
} from '@tina-chris/tina-bus'
import { Tool, type ToolParameters } from './base'

export class MessageTool extends Tool {
  constructor(
    private bus: MessageBus,
    private channel: string = '',
    private chatId: string = ''
  ) {
    super()
  }

  setContext(channel: string, chatId: string): void {
    this.channel = channel
    this.chatId = chatId
  }

  get name(): string {
    return 'message'
  }

  get description(): string {
    return 'Send a message to the current desktop chat.'
  }

  get parameters(): ToolParameters {
    return Type.Object({
      content: Type.String({ description: 'Message content to send.' }),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const content = typeof params.content === 'string' ? params.content : ''
    if (!content.trim()) {
      return 'Error: content is required.'
    }

    const metadata: MessageMetadata = {
      id: randomUUID(),
      displayType: 'assistant',
      displayStatus: 'complete',
    }

    this.bus.publishOutbound(
      new OutboundMessage({
        channel: this.channel,
        chatId: this.chatId,
        senderId: 'agent',
        type: 'text',
        content,
        metadata,
      })
    )

    return `Message sent to ${this.channel}:${this.chatId}`
  }
}
