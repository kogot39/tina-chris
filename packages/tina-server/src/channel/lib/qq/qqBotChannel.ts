import { Bot, ReceiverMode, segment } from 'qq-official-bot'
import { logger } from '@tina-chris/tina-util'
import { BaseChannel, type ChannelStatus, createChannelStatus } from '../base'

import type { QQBotChannelConfig } from './qqBotConfig'

export const QQ_CHANNEL_KEY = 'qq'

export class QQBotChannel extends BaseChannel {
  private client: Bot
  private config: QQBotChannelConfig
  private status: ChannelStatus = createChannelStatus(
    QQ_CHANNEL_KEY,
    false,
    'QQ 机器人未连接。'
  )

  constructor(config: QQBotChannelConfig) {
    super()
    this.config = config
    this.assertConfig()
    this.client = new Bot({
      appid: config.appID.trim(),
      secret: config.secret.trim(),
      sandbox: config.sandbox,
      removeAt: true,
      intents: [
        // 当前先只支持私聊消息事件，后续可以根据需要增加群聊消息等事件类型
        'C2C_MESSAGE_CREATE', // 私聊消息事件
      ],
      mode: ReceiverMode.WEBSOCKET,
    })
    // 监听私聊消息
    this.client.on('message.private', async (event) => {
      // 将结果发送到 AgentLoop，payload 格式与 MessageBus 中一致
      this.emitInboundText({
        chatId: event.user_id,
        senderId: event.sender.user_id,
        content: event.raw_message,
      })
    })
  }

  async start(): Promise<void> {
    if (this.status.connected) {
      return
    }

    this.status = createChannelStatus(
      QQ_CHANNEL_KEY,
      false,
      'QQ 机器人连接中。'
    )

    try {
      await this.client.start()
      this.status = createChannelStatus(
        QQ_CHANNEL_KEY,
        true,
        'QQ 机器人已连接。'
      )
    } catch (error) {
      logger.error(`Failed to connect QQ bot: ${error}`)
      this.status = createChannelStatus(
        QQ_CHANNEL_KEY,
        false,
        `QQ 机器人连接失败：${error instanceof Error ? error.message : String(error)}`
      )
      await this.client.stop() // 确保连接失败时资源被清理
      throw new Error(
        `Failed to connect QQ bot: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async stop(): Promise<void> {
    if (!this.status.connected) {
      return
    }

    await this.client.stop()
    this.status = createChannelStatus(
      QQ_CHANNEL_KEY,
      false,
      'QQ 机器人已断开连接。'
    )
  }

  async sendText(chatId: string, content: string): Promise<void> {
    if (!this.status.connected) {
      throw new Error('Cannot send message: QQ bot is not connected.')
    }
    // 将消息内容包装成 QQ 机器人 SDK 需要的格式并发送，segment.markdown 可以让消息以 Markdown 格式展示
    await this.client.messageService.sendPrivateMessage(chatId, [
      segment.markdown(content),
    ])
  }

  getStatus(): ChannelStatus {
    return this.status
  }

  private assertConfig(): void {
    if (!this.config.appID.trim()) {
      throw new Error('QQ bot App ID is required before connecting.')
    }

    if (!this.config.secret.trim()) {
      throw new Error('QQ bot Secret is required before connecting.')
    }
  }
}
