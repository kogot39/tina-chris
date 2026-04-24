import { BaseSTT } from './lib/base'
import { QwenSTT, QwenSTTConfig, getQwenConfigForm } from './lib/qwen/qwenSTT'
import {
  ConnectionEndMessage,
  ConnectionStartMessage,
  InboundMessage,
  MessageBus,
  OutboundMessage,
} from '@tina-chris/tina-bus'
import { logger } from '@tina-chris/tina-util'

import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import { Config } from '@/config'

type STTFactoryConfig = QwenSTTConfig

export type STTProvider = {
  title: string
  // 描述尽可能保证占两行的位置
  description: string
  create: (config: STTFactoryConfig) => BaseSTT
  form: () => DynamicFormSchema
}

const STT_MANAGER_TARGET = 'stt-manager'

const STTMap = {
  qwen: {
    title: 'Qwen STT',
    description:
      '基于阿里巴巴通义千问的实时语音识别服务，api获取地址：https://bailian.console.aliyun.com/cn-beijing/#/home',
    create: (config: STTFactoryConfig) => new QwenSTT(config as QwenSTTConfig),
    form: () => getQwenConfigForm(),
  },
} as const satisfies Record<string, STTProvider>

export type STTProviderKey = keyof typeof STTMap

export const getAvailableSTTs = () => {
  return Object.entries(STTMap).map(([key, value]) => ({
    key,
    title: value.title,
    description: value.description,
  }))
}

export const getSTTConfigFormByKey = (
  key: string
): DynamicFormSchema | null => {
  const provider = STTMap[key as STTProviderKey]
  if (!provider) {
    return null
  }

  return provider.form()
}

export class STTManager {
  private sessionInstances = new Map<string, BaseSTT>()
  private config: Config
  private bus: MessageBus

  constructor(config: Config, bus: MessageBus) {
    this.config = config
    this.bus = bus

    // 订阅特定发送给stt-manager的消息，处理STT相关的连接和音频数据。
    // 可以减少不必要的消息处理开销，同时保持STT功能的内聚性和独立性
    this.bus.subscribeInbound(
      STT_MANAGER_TARGET,
      async (message: InboundMessage) => {
        if (message instanceof ConnectionStartMessage) {
          await this.handleConnectionStart(message)
          this.publish(message, 'text', 'STT session started.')
          return
        }

        if (message instanceof ConnectionEndMessage) {
          await this.handleConnectionEnd(message)
          return
        }

        // 只能处理音频消息，其他类型的消息不予处理，保持职责单一
        if (message.type === 'audio') {
          await this.handleAudioMessage(message)
        }
      }
    )
  }

  private getCurrentProvider(): STTProvider | null {
    const current = this.config.stt.current
    if (!current) {
      return null
    }

    return STTMap[current as STTProviderKey] ?? null
  }

  private getCurrentProviderConfig(): STTFactoryConfig | null {
    const provider = this.getCurrentProvider()
    if (!provider) {
      return null
    }

    // 获取当前STT提供商的配置数据，工厂方法需要这些数据来创建STT实例
    const config = this.config.getConfig('stt')
    if (!config) {
      return null
    }

    return config as STTFactoryConfig
  }

  private createSessionInstance(message: InboundMessage): BaseSTT | null {
    const provider = this.getCurrentProvider()
    const config = this.getCurrentProviderConfig()

    if (!provider || !config) {
      this.publish(message, 'error', 'STT service is not configured.')
      return null
    }

    const instance = provider.create(config)
    instance.setTranscriptHandler((transcript: string) => {
      // 将识别到的文本通过消息总线发布出去，供前端显示
      this.publish(message, 'text', transcript)
      // 同时也发布一个内部消息，供其他模块（如Agent）使用识别结果进行后续处理
      this.bus.publishInbound(
        new InboundMessage({
          channel: message.channel,
          chatId: message.chatId,
          senderId: STT_MANAGER_TARGET,
          content: transcript,
          type: 'text',
          sendTo: 'agent',
        })
      )
    })
    // 设置错误处理器，任何STT实例发生的错误都会通过这个处理器捕获，并发布一个错误消息，供前端显示
    instance.setErrorHandler((error: Error) => {
      this.publish(message, 'error', `STT error: ${error.message}`)
    })

    return instance
  }

  // 确保当前消息对应的STT会话已经创建并连接，如果没有则创建一个新的会话实例并连接
  private async ensureSession(
    message: InboundMessage
  ): Promise<BaseSTT | null> {
    const sessionKey = message.sessionKey
    const existing = this.sessionInstances.get(sessionKey)
    if (existing) {
      return existing
    }

    const instance = this.createSessionInstance(message)
    if (!instance) {
      return null
    }

    try {
      await instance.connect()
      this.sessionInstances.set(sessionKey, instance)
      return instance
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown connect error.'
      this.publish(
        message,
        'error',
        `Failed to connect STT provider: ${reason}`
      )
      await instance.close().catch(() => undefined)
      return null
    }
  }

  // 处理连接开始的消息，确保为每个新的会话创建一个STT实例并连接
  private async handleConnectionStart(message: InboundMessage): Promise<void> {
    const sessionKey = message.sessionKey
    if (this.sessionInstances.has(sessionKey)) {
      return
    }

    await this.ensureSession(message)
  }

  private async handleAudioMessage(message: InboundMessage): Promise<void> {
    // 只处理 ArrayBuffer类型的音频数据，其他格式的数据不予处理，保持数据格式的一致性和简化处理逻辑
    if (!(message.media instanceof ArrayBuffer)) {
      this.publish(
        message,
        'error',
        'Invalid audio payload: media must be ArrayBuffer.'
      )
      return
    }

    const instance = await this.ensureSession(message)
    if (!instance) {
      return
    }

    try {
      await instance.handleAudio(message.media)
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown audio handle error.'
      this.publish(message, 'error', `Failed to process audio: ${reason}`)
    }
  }

  // 处理连接结束的消息，关闭对应会话的STT实例并清理资源
  private async handleConnectionEnd(message: InboundMessage): Promise<void> {
    const sessionKey = message.sessionKey
    const instance = this.sessionInstances.get(sessionKey)
    if (!instance) {
      return
    }

    this.sessionInstances.delete(sessionKey)
    try {
      await instance.close()
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown close error.'
      this.publish(message, 'error', `Failed to close STT session: ${reason}`)
    }
  }

  private publish(
    message: InboundMessage,
    type: string,
    content: string
  ): void {
    if (type === 'error') {
      logger.error(`[STTManager] ${content}`)
    }

    this.bus.publishOutbound(
      new OutboundMessage({
        channel: message.channel,
        chatId: message.chatId,
        senderId: STT_MANAGER_TARGET,
        content,
        type,
      })
    )
  }

  getCurrentSTTConfigForm(): DynamicFormSchema | null {
    const provider = this.getCurrentProvider()
    if (!provider) {
      return null
    }

    return provider.form()
  }

  // 关闭所有STT会话实例，通常在服务器关闭或配置更改时调用
  async shutdown(): Promise<void> {
    const closingTasks = Array.from(this.sessionInstances.values()).map(
      async (instance) => instance.close().catch(() => undefined)
    )

    this.sessionInstances.clear()
    await Promise.all(closingTasks)
  }
}
