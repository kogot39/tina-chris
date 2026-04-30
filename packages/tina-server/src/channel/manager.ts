import { InboundMessage, MessageBus } from '@tina-chris/tina-bus'
import { logger } from '@tina-chris/tina-util'
import { QQBotChannel, QQ_CHANNEL_KEY } from './lib/qq/qqBotChannel'
import {
  type QQBotChannelConfig,
  getQQBotConfigForm,
} from './lib/qq/qqBotConfig'
import {
  type BaseChannel,
  type ChannelInboundTextMessage,
  type ChannelStatus,
  createChannelStatus,
} from './lib/base'

import type { OutboundMessage } from '@tina-chris/tina-bus'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import type { Config } from '@/config'

type ChannelFactoryConfig = QQBotChannelConfig

export type ChannelProvider = {
  title: string
  description: string
  create: (config: ChannelFactoryConfig) => BaseChannel
  form: () => DynamicFormSchema
}

const ChannelMap = {
  [QQ_CHANNEL_KEY]: {
    title: 'QQ 机器人',
    description:
      '接入 QQ 官方机器人，用于通过 QQ 私信或群聊@消息远程访问 Agent。',
    create: (config: ChannelFactoryConfig) =>
      new QQBotChannel(config as QQBotChannelConfig),
    form: () => getQQBotConfigForm(),
  },
} as const satisfies Record<string, ChannelProvider>

export type ChannelProviderKey = keyof typeof ChannelMap

export type ChannelProviderItem = {
  key: string
  title: string
  description: string
  enabled: boolean
  connected: boolean
}

// 检查配置信息是否包含 enabled 字段，并且是 boolean 类型
const isEnabledChannelConfig = (
  value: unknown
): value is ChannelFactoryConfig => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'enabled' in value &&
    typeof (value as { enabled?: unknown }).enabled === 'boolean'
  )
}

export const getAvailableChannels = (
  config?: Config,
  manager?: ChannelManager
): ChannelProviderItem[] => {
  return Object.entries(ChannelMap).map(([key, value]) => {
    const providerConfig = config?.getChannelConfig(key)
    const status = manager?.getStatus(key)

    return {
      key,
      title: value.title,
      description: value.description,
      // 是否启用
      enabled: isEnabledChannelConfig(providerConfig)
        ? providerConfig.enabled
        : false,
      // 是否已连接
      connected: status?.connected ?? false,
    }
  })
}

export const getChannelConfigFormByKey = (
  key: string
): DynamicFormSchema | null => {
  const provider = ChannelMap[key as ChannelProviderKey]
  return provider ? provider.form() : null
}

export const isSupportedChannelProvider = (
  key: string
): key is ChannelProviderKey => {
  return key in ChannelMap
}

export class ChannelManager {
  private instances = new Map<string, BaseChannel>()
  private statuses = new Map<string, ChannelStatus>()
  // 记录已经订阅的出站通道，避免重复订阅导致消息处理混乱
  private subscribedOutboundChannels = new Set<string>()

  constructor(
    private config: Config,
    private bus: MessageBus
  ) {
    // 构造时只为已启用的通道建立总线订阅，真正连接由应用启动阶段显式调用 startChannel。
    // 这样可以避免 Electron 还未 ready 时就触发外部网络连接，同时保证远程回复路径已经注册。
    for (const [providerKey, providerConfig] of Object.entries(
      this.config.getAllChannelConfigs()
    )) {
      if (isSupportedChannelProvider(providerKey) && providerConfig.enabled) {
        this.ensureOutboundSubscription(providerKey)
      }
    }
  }

  // 启动指定通道，或启动所有已启用的通道
  async startChannel(providerKey?: string): Promise<ChannelStatus[]> {
    const targetKeys = providerKey
      ? [providerKey]
      : Object.entries(this.config.getAllChannelConfigs())
          .filter(([, providerConfig]) => providerConfig.enabled)
          .map(([key]) => key)

    const statuses: ChannelStatus[] = []
    for (const key of targetKeys) {
      statuses.push(await this.startSingleChannel(key))
    }

    return statuses
  }

  async restartChannel(providerKey: string): Promise<ChannelStatus> {
    await this.stopSingleChannel(providerKey)
    return this.startSingleChannel(providerKey)
  }

  async stopChannel(providerKey?: string): Promise<ChannelStatus[]> {
    const targetKeys = providerKey
      ? [providerKey]
      : Array.from(this.instances.keys())

    const statuses: ChannelStatus[] = []
    for (const key of targetKeys) {
      statuses.push(await this.stopSingleChannel(key))
    }

    return statuses
  }

  async setChannelEnabled(
    providerKey: string,
    enabled: boolean
  ): Promise<ChannelStatus> {
    if (!isSupportedChannelProvider(providerKey)) {
      throw new Error(`Unsupported channel provider: ${providerKey}`)
    }
    // 开启后自动连接
    if (enabled) {
      this.ensureOutboundSubscription(providerKey)
      return this.startSingleChannel(providerKey)
    }

    return this.stopSingleChannel(providerKey)
  }

  getStatus(providerKey: string): ChannelStatus {
    const instance = this.instances.get(providerKey)
    if (instance) {
      return instance.getStatus()
    }

    return (
      this.statuses.get(providerKey) ??
      createChannelStatus(providerKey, false, '聊天通道未连接。')
    )
  }

  async shutdown(): Promise<void> {
    await this.stopChannel()
  }

  private async startSingleChannel(
    providerKey: string
  ): Promise<ChannelStatus> {
    if (!isSupportedChannelProvider(providerKey)) {
      throw new Error(`Unsupported channel provider: ${providerKey}`)
    }

    const provider = ChannelMap[providerKey]
    const providerConfig = this.getProviderConfig(providerKey)
    // 如果配置里 enabled 字段为 false，则不启动通道，并设置状态为未连接
    if (!providerConfig.enabled) {
      const status = createChannelStatus(providerKey, false, '聊天通道未启用。')
      this.statuses.set(providerKey, status)
      return status
    }
    // 排除已经连接的通道，避免重复连接导致异常
    const existing = this.instances.get(providerKey)
    if (existing?.getStatus().connected) {
      return existing.getStatus()
    }

    if (existing) {
      await this.stopSingleChannel(providerKey)
    }

    // 当前并不存在连接，才创建实例和订阅总线，确保整个连接流程幂等且可重试。
    this.ensureOutboundSubscription(providerKey)
    // 创建通道实例并注册入站消息处理器
    const instance = provider.create(providerConfig)
    instance.setInboundTextHandler((message) => {
      // 将发送到 agent 消息的方法暴露给通道实例，供其在接收到用户消息时调用
      // 这样可以避免通道实例直接依赖 MessageBus，降低耦合度，同时保证消息格式和分发逻辑的一致性。
      this.forwardInboundText(providerKey, message)
    })
    this.instances.set(providerKey, instance)

    try {
      await instance.start()
      const status = instance.getStatus()
      // 成功连接后更新状态，失败会在 catch 里设置未连接状态并清理实例，确保状态与实际连接情况一致
      this.statuses.set(providerKey, status)
      return status
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const status = createChannelStatus(
        providerKey,
        false,
        `聊天通道连接失败：${reason}`
      )
      this.statuses.set(providerKey, status)
      this.instances.delete(providerKey)
      await instance.stop().catch(() => undefined)
      logger.error(`[ChannelManager] Failed to start ${providerKey}: ${reason}`)
      // 启动失败时抛出错误，供调用方展示通知或进行其他处理
      throw new Error(`Failed to start ${providerKey} channel: ${reason}`)
    }
  }

  private async stopSingleChannel(providerKey: string): Promise<ChannelStatus> {
    if (!isSupportedChannelProvider(providerKey)) {
      throw new Error(`Unsupported channel provider: ${providerKey}`)
    }

    const instance = this.instances.get(providerKey)
    this.instances.delete(providerKey)

    if (instance) {
      await instance.stop()
    }

    const status = createChannelStatus(providerKey, false, '聊天通道未连接。')
    this.statuses.set(providerKey, status)
    return status
  }

  private getProviderConfig(providerKey: string): ChannelFactoryConfig {
    const providerConfig = this.config.getChannelConfig(providerKey)
    if (!isEnabledChannelConfig(providerConfig)) {
      throw new Error(`Channel config is missing: ${providerKey}`)
    }

    return providerConfig
  }

  private ensureOutboundSubscription(providerKey: string): void {
    if (this.subscribedOutboundChannels.has(providerKey)) {
      return
    }

    // 出站订阅按 provider key 注册，保证总线 channel 与配置键名完全一致。
    // MessageBus 暂不支持取消订阅，所以这里用 Set 保证每个通道只订阅一次。
    this.bus.subscribeOutbound(providerKey, async (message) => {
      await this.handleOutboundMessage(providerKey, message)
    })
    this.subscribedOutboundChannels.add(providerKey)
  }

  private forwardInboundText(
    providerKey: string,
    message: ChannelInboundTextMessage
  ): void {
    this.bus.publishInbound(
      new InboundMessage({
        channel: providerKey,
        chatId: message.chatId,
        senderId: message.senderId,
        sendTo: 'agent',
        type: 'text',
        content: message.content,
        metadata: {
          channelProvider: providerKey,
          ...message.metadata,
        },
      })
    )
  }

  // 统一分发处理
  private async handleOutboundMessage(
    providerKey: string,
    message: OutboundMessage
  ): Promise<void> {
    // 当前只接受文本消息，其他类型直接丢弃；如果需要支持更多类型，可以在这里扩展不同的处理逻辑
    if (message.type !== 'text' && message.type !== 'error') {
      return
    }

    const content = message.content.trim()
    if (!content) {
      return
    }
    // 拿到示例后再次检查连接状态，避免在通道断开过程中收到消息导致异常
    const instance = this.instances.get(providerKey)
    if (!instance || !instance.getStatus().connected) {
      logger.warn(
        `[ChannelManager] ${providerKey} channel is not connected, outbound message ignored.`
      )
      return
    }

    try {
      // 将结果发送到通道实例，由通道负责转发给用户；如果发送失败，记录错误日志但不抛出，避免影响其他消息处理流程
      await instance.sendText(message.chatId, content)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.error(
        `[ChannelManager] Failed to send ${providerKey} message: ${reason}`
      )
    }
  }
}
