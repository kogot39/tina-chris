import { BaseTTS } from './lib/base'
import {
  QwenTTS,
  QwenTTSConfig,
  createVoiceTone,
  deleteVoiceTone,
  getConfigForm,
  getQwenVoiceCloneForm,
  listVoiceTone,
  normalizeQwenVoiceCloneValues,
  ttsModel,
} from './lib/qwen'
import {
  ConnectionEndMessage,
  ConnectionStartMessage,
  InboundMessage,
  MessageBus,
  OutboundMessage,
} from '@tina-chris/tina-bus'
import { logger } from '@tina-chris/tina-util'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

import type { Config } from '@/config'

type TTSFactoryConfig = QwenTTSConfig

export type TTSProvider = {
  title: string
  description: string
  create: (config: TTSFactoryConfig) => BaseTTS
  form: () => DynamicFormSchema
  voiceClone?: {
    form: () => DynamicFormSchema
    create: (
      config: TTSFactoryConfig,
      values: DynamicFormValues
    ) => Promise<Record<string, unknown>>
    list: (config: TTSFactoryConfig) => Promise<Array<Record<string, unknown>>>
    delete: (config: TTSFactoryConfig, voice: string) => Promise<void>
  }
}

const TTS_MANAGER_TARGET = 'tts-manager'
// TTS 连接创建成本较高，结束一句话后先保留一段时间，便于连续回复复用。
const TTS_IDLE_CLOSE_MS = 5 * 60 * 1000
// 句子边界由 TTSManager 统一判断；AgentLoop 不再依赖 <speak> 标签分句。
const SENTENCE_END_RE =
  /(?:\.{3}|\u2026|[\u3002\uFF01\uFF1F!?\uFF1B;\r\n])(?:["'\u201D\u2019\uFF09\u3011\u300B\u300D\u300F\]\s]*)$/
// 如果模型长时间不输出句末标点，达到软长度且遇到空白也提交一次，降低语音延迟。
const SOFT_COMMIT_LENGTH = 120

const TTSMap = {
  qwen: {
    title: 'Qwen TTS',
    description:
      '基于 DashScope/Qwen 的实时语音合成服务，支持流式 PCM 输出与音色复刻。',
    create: (config: TTSFactoryConfig) => new QwenTTS(config as QwenTTSConfig),
    form: () => getConfigForm(),
    // TODO: 应该放到供应商对应声音复刻功能中去编写实现，后续需要优化
    voiceClone: {
      form: () => getQwenVoiceCloneForm(),
      create: async (config: TTSFactoryConfig, values: DynamicFormValues) => {
        if (!config.apiKey) {
          throw new Error('API Key is required to create voice clone.')
        }
        const input = normalizeQwenVoiceCloneValues(values)
        const result = await createVoiceTone({
          apiKey: config.apiKey,
          preferredName: input.preferredName,
          audioData: input.audioData,
          targetModel: config.model || ttsModel,
          text: input.text,
          language: input.language,
        })

        return {
          output: result.output,
          requestId: result.request_id,
        }
      },
      list: async (config: TTSFactoryConfig) => {
        if (!config.apiKey) {
          throw new Error('API Key is required to list voice clones.')
        }
        const result = await listVoiceTone({
          apiKey: config.apiKey,
          pageIndex: 0,
          pageSize: 50,
        })

        return result.output?.voice_list || []
      },
      delete: async (config: TTSFactoryConfig, voice: string) => {
        if (!config.apiKey) {
          throw new Error('API Key is required to delete voice clones.')
        }
        await deleteVoiceTone({
          apiKey: config.apiKey,
          voice,
        })
      },
    },
  },
} as const satisfies Record<string, TTSProvider>

export type TTSProviderKey = keyof typeof TTSMap

export const getAvailableTTSs = () => {
  return Object.entries(TTSMap).map(([key, value]) => ({
    key,
    title: value.title,
    description: value.description,
  }))
}

export const getTTSConfigFormByKey = (
  key: string
): DynamicFormSchema | null => {
  const provider = TTSMap[key as TTSProviderKey]
  return provider ? provider.form() : null
}
// 封装对应的抽象
// 获取声音复刻表单
export const getTTSVoiceCloneFormByKey = (
  key: string
): DynamicFormSchema | null => {
  const provider = TTSMap[key as TTSProviderKey]
  return provider?.voiceClone ? provider.voiceClone.form() : null
}
// 创建声音复刻，使用 providerKey 定位供应商，providerConfig 传入供应商配置，values 是表单值
export const createTTSVoiceCloneByKey = async (
  providerKey: string,
  providerConfig: Record<string, unknown> | null,
  values: DynamicFormValues
) => {
  const provider = TTSMap[providerKey as TTSProviderKey]
  if (!provider?.voiceClone || !providerConfig) {
    throw new Error(`TTS provider does not support voice clone: ${providerKey}`)
  }

  return provider.voiceClone.create(
    providerConfig as unknown as TTSFactoryConfig,
    values
  )
}
// 获取声音复刻音色列表
export const listTTSVoiceClonesByKey = async (
  providerKey: string,
  providerConfig: Record<string, unknown> | null
) => {
  const provider = TTSMap[providerKey as TTSProviderKey]
  if (!provider?.voiceClone || !providerConfig) {
    throw new Error(`TTS provider does not support voice clone: ${providerKey}`)
  }

  return provider.voiceClone.list(providerConfig as unknown as TTSFactoryConfig)
}
// 删除声音复刻，voice 参数是要删除的音色标识
export const deleteTTSVoiceCloneByKey = async (
  providerKey: string,
  providerConfig: Record<string, unknown> | null,
  voice: string
) => {
  const provider = TTSMap[providerKey as TTSProviderKey]
  if (!provider?.voiceClone || !providerConfig) {
    throw new Error(`TTS provider does not support voice clone: ${providerKey}`)
  }

  await provider.voiceClone.delete(
    providerConfig as unknown as TTSFactoryConfig,
    voice
  )
}

export class TTSManager {
  private sessionInstances = new Map<string, BaseTTS>()
  private forwardingSessions = new Set<string>()
  private idleCloseTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private sessionActivityVersions = new Map<string, number>()
  private sessionSources = new Map<string, InboundMessage>()
  private sessionOperationQueues = new Map<string, Promise<void>>()
  private sessionHasPendingText = new Map<string, boolean>()
  private sessionSentenceBuffers = new Map<string, string>()
  // abort 可能发生在若干文本 chunk 已进入 bus 但尚未被 TTSManager 消费时。
  // 记录中止时间后，旧 chunk 会在 dispatchInboundMessage() 前被丢弃，防止停止后又重开 TTS。
  private sessionAbortTimestamps = new Map<string, number>()

  constructor(
    private config: Config,
    private bus: MessageBus
  ) {
    // 订阅发送给 tts-manager 的消息，所有与 TTS 相关的消息都会通过这个订阅进入 TTSManager 进行处理
    this.bus.subscribeInbound(TTS_MANAGER_TARGET, async (message) => {
      await this.enqueueSessionOperation(message)
    })
  }

  private getCurrentProvider(): TTSProvider | null {
    const current = this.config.tts.current
    if (!current) {
      return null
    }

    return TTSMap[current as TTSProviderKey] ?? null
  }

  private getCurrentProviderConfig(): TTSFactoryConfig | null {
    const provider = this.getCurrentProvider()
    if (!provider) {
      return null
    }

    const config = this.config.getConfig('tts')
    return config ? (config as TTSFactoryConfig) : null
  }

  private createSessionInstance(message: InboundMessage): BaseTTS | null {
    const provider = this.getCurrentProvider()
    const config = this.getCurrentProviderConfig()

    if (!provider || !config) {
      this.publishError(message, 'TTS service is not configured.')
      return null
    }

    const instance = provider.create(config)
    instance.setErrorHandler((error) => {
      const source = this.sessionSources.get(message.sessionKey) ?? message
      if (this.shouldDropAfterAbort(message)) {
        return
      }
      // 忽略空音频缓存时提交 commit 时抛出的错误
      if (this.isIgnorableEmptyBufferError(error.message)) {
        logger.warn(
          `[TTSManager] Ignoring empty buffer commit error: ${error.message}`
        )
        return
      }
      this.publishError(source, `TTS error: ${error.message}`)
    })

    return instance
  }

  private async ensureSession(
    message: InboundMessage
  ): Promise<BaseTTS | null> {
    const sessionKey = message.sessionKey
    // 检查是否已经存在该会话的实例，如果有则直接复用
    const existing = this.sessionInstances.get(sessionKey)
    if (existing) {
      return existing
    }

    // 创建新的 TTS 实例
    const instance = this.createSessionInstance(message)
    if (!instance) {
      return null
    }

    // 启动音频流流转，接收 TTS 生成的音频流并转发出站
    this.startForwarding(sessionKey, message, instance)

    try {
      // 建立与底层 TTS 服务的连接
      await instance.connect()
      this.sessionInstances.set(sessionKey, instance)
      this.sessionSources.set(sessionKey, message)
      return instance
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown connect error.'
      if (!this.shouldDropAfterAbort(message)) {
        this.publishError(message, `Failed to connect TTS provider: ${reason}`)
      }
      await instance.close().catch(() => undefined)
      this.forwardingSessions.delete(sessionKey)
      this.clearSessionTracking(sessionKey)
      return null
    }
  }

  private startForwarding(
    sessionKey: string,
    source: InboundMessage,
    instance: BaseTTS
  ): void {
    // 避免重复启动消息转发循环
    if (this.forwardingSessions.has(sessionKey)) {
      return
    }

    this.forwardingSessions.add(sessionKey)
    ;(async () => {
      try {
        // 持续消费 TTS 生成完毕的音频事件（异步生成）
        for await (const event of instance.receiveEvents()) {
          // 通过 MessageBus 发布带有 TTS 生成音频的出站消息
          this.bus.publishOutbound(
            new OutboundMessage({
              channel: source.channel,
              chatId: source.chatId,
              senderId: TTS_MANAGER_TARGET,
              type: 'audio',
              // 此处将接收到的流式音频片段组装成媒体数组返回
              media: [event.audio],
            })
          )
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (!this.shouldDropAfterAbort(source)) {
          this.publishError(source, `TTS audio stream failed: ${reason}`)
        }
      } finally {
        // 无论正常结束还是发生崩溃，清理转发过程中的标记
        this.forwardingSessions.delete(sessionKey)
        this.clearSessionTracking(sessionKey, instance)
      }
    })()
  }

  private async handleConnectionStart(message: InboundMessage): Promise<void> {
    // 处理 TTS 开始连接指令，刷新活跃时间避免由于闲置被关闭
    this.markSessionActive(message)
    await this.ensureSession(message)
  }

  private async handleTextMessage(message: InboundMessage): Promise<void> {
    const content = this.sanitizeSpeechText(message.content)
    // 忽略空格或无效的文本
    if (!content || !content.trim()) {
      return
    }

    // 收到文本，视作会话处于活跃状态，重置过期时间
    this.markSessionActive(message)
    const instance = await this.ensureSession(message)
    if (!instance) {
      return
    }

    try {
      // 将分块的文字通过流方式直接追加发送给 TTS 实例
      await instance.appendText(content)
      // 记录存在尚未 commit 提交处理的文本数据
      this.sessionHasPendingText.set(message.sessionKey, true)
      this.appendSentenceBuffer(message.sessionKey, content)
      if (this.shouldCommitSentence(message.sessionKey)) {
        await this.commitPendingText(message, instance)
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown append error.'
      if (!this.shouldDropAfterAbort(message)) {
        this.publishError(message, `Failed to append TTS text: ${reason}`)
      }
    }
  }

  private async handleConnectionEnd(message: InboundMessage): Promise<void> {
    // 处理 TTS 合成一句话的结束标志，标志所有文本下发完毕
    const sessionKey = message.sessionKey
    const instance = this.sessionInstances.get(sessionKey)
    if (!instance) {
      return
    }

    const activityVersion = this.markSessionActive(message)
    if (this.sessionHasPendingText.get(sessionKey)) {
      const committed = await this.commitPendingText(message, instance)
      if (!committed) return
    }

    // 如果在这期间又有新的活跃动作发生（例如开启了一个新生成词），那么不需要挂起退出
    if (this.sessionActivityVersions.get(sessionKey) !== activityVersion) {
      return
    }

    // 将结束并处于闲置状态的处理会话挂入延迟关闭队列中，节约资源
    this.scheduleIdleClose(sessionKey, activityVersion)
  }

  private publishError(source: InboundMessage, content: string): void {
    logger.error(`[TTSManager] ${content}`)
    this.bus.publishOutbound(
      new OutboundMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: TTS_MANAGER_TARGET,
        type: 'error',
        content,
      })
    )
  }

  async shutdown(): Promise<void> {
    const closingTasks = Array.from(this.sessionInstances.values()).map(
      async (instance) => instance.close().catch(() => undefined)
    )

    for (const timer of this.idleCloseTimers.values()) {
      clearTimeout(timer)
    }

    this.sessionInstances.clear()
    this.forwardingSessions.clear()
    this.idleCloseTimers.clear()
    this.sessionActivityVersions.clear()
    this.sessionSources.clear()
    this.sessionOperationQueues.clear()
    this.sessionHasPendingText.clear()
    this.sessionSentenceBuffers.clear()
    this.sessionAbortTimestamps.clear()
    await Promise.all(closingTasks)
  }

  async abortSession(channel: string, chatId: string): Promise<void> {
    const sessionKey = `${channel}:${chatId}`
    // 先写 abort 时间，再关闭底层实例。这样并发排队中的消息即使晚一点执行，
    // 也能通过 timestamp 判断自己属于已中止的旧回复。
    this.sessionAbortTimestamps.set(sessionKey, Date.now())
    const instance = this.sessionInstances.get(sessionKey)
    if (!instance) {
      this.clearSessionTracking(sessionKey)
      return
    }

    this.sessionInstances.delete(sessionKey)
    this.clearSessionTracking(sessionKey)
    await instance.close({ graceful: false }).catch(() => undefined)
  }

  private markSessionActive(message: InboundMessage): number {
    const sessionKey = message.sessionKey
    this.sessionSources.set(sessionKey, message)

    this.clearIdleCloseTimer(sessionKey)

    const nextVersion = (this.sessionActivityVersions.get(sessionKey) ?? 0) + 1
    this.sessionActivityVersions.set(sessionKey, nextVersion)
    return nextVersion
  }

  private scheduleIdleClose(sessionKey: string, activityVersion: number): void {
    this.clearIdleCloseTimer(sessionKey)

    const timer = setTimeout(() => {
      this.closeIdleSession(sessionKey, activityVersion)
    }, TTS_IDLE_CLOSE_MS)

    this.idleCloseTimers.set(sessionKey, timer)
  }

  private async closeIdleSession(
    sessionKey: string,
    activityVersion: number
  ): Promise<void> {
    if (this.sessionActivityVersions.get(sessionKey) !== activityVersion) {
      return
    }

    const instance = this.sessionInstances.get(sessionKey)
    const source = this.sessionSources.get(sessionKey)

    if (!instance) {
      this.clearSessionTracking(sessionKey)
      return
    }

    this.sessionInstances.delete(sessionKey)
    this.clearIdleCloseTimer(sessionKey)

    try {
      await instance.close()
    } catch (error) {
      if (!source) {
        return
      }

      const reason =
        error instanceof Error ? error.message : 'Unknown close error.'
      if (!this.shouldDropAfterAbort(source)) {
        this.publishError(source, `Failed to close idle TTS session: ${reason}`)
      }
    }
  }

  private clearIdleCloseTimer(sessionKey: string): void {
    const timer = this.idleCloseTimers.get(sessionKey)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    this.idleCloseTimers.delete(sessionKey)
  }

  private clearSessionTracking(sessionKey: string, instance?: BaseTTS): void {
    const current = this.sessionInstances.get(sessionKey)
    if (instance && current && current !== instance) {
      return
    }

    this.clearIdleCloseTimer(sessionKey)
    this.sessionActivityVersions.delete(sessionKey)
    this.sessionSources.delete(sessionKey)
    this.sessionHasPendingText.delete(sessionKey)
    this.sessionSentenceBuffers.delete(sessionKey)

    if (!instance || current === instance) {
      this.sessionInstances.delete(sessionKey)
    }
  }

  private async enqueueSessionOperation(
    message: InboundMessage
  ): Promise<void> {
    // 按 session 为每一个对话创建 Promise 执行链，保证同 session 的消息串行且按序消费
    const sessionKey = message.sessionKey
    const previous =
      this.sessionOperationQueues.get(sessionKey) ?? Promise.resolve()

    // 无论之前的操作成功或抛错异常，捕获失败然后继续执行接下来的消息分发动作
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        // 根据 message 的类型，分步下发消息进行文本或者关闭等的处理
        await this.dispatchInboundMessage(message)
      })

    // 将执行任务挂上字典作为下一次派发任务的前置状态
    this.sessionOperationQueues.set(sessionKey, next)

    try {
      // 捕获并返回本次处理完是否完成的最终执行状态
      await next
    } finally {
      // 清空操作缓冲队列的尾指针避免内存泄漏（如果最新一次操作已经完成）
      if (this.sessionOperationQueues.get(sessionKey) === next) {
        this.sessionOperationQueues.delete(sessionKey)
      }
    }
  }

  private async dispatchInboundMessage(message: InboundMessage): Promise<void> {
    if (this.shouldDropAfterAbort(message)) {
      return
    }

    // 起始指令处理：提前触发并建立连接（可选，后续收到文本仍有处理）
    if (message instanceof ConnectionStartMessage) {
      await this.handleConnectionStart(message)
      return
    }

    // 完结指令处理：处理 commit 断句缓冲提交，闲置自动关闭等逻辑
    if (message instanceof ConnectionEndMessage) {
      await this.handleConnectionEnd(message)
      return
    }

    // 对文本串流的处理情况
    if (message.type === 'text') {
      await this.handleTextMessage(message)
    }
  }

  private shouldDropAfterAbort(message: InboundMessage): boolean {
    const abortTimestamp = this.sessionAbortTimestamps.get(message.sessionKey)
    if (abortTimestamp === undefined) {
      return false
    }

    if (message.timestamp <= abortTimestamp) {
      return true
    }

    // 时间晚于 abort 的消息属于同一 chat 中的新回复。此时清掉 abort 标记，
    // 让新一轮 TTS 正常开始，同时仍保证旧回复排队中的 chunk 被丢弃。
    this.sessionAbortTimestamps.delete(message.sessionKey)
    return false
  }

  private isIgnorableEmptyBufferError(message: string): boolean {
    const normalized = message.toLowerCase()
    return (
      (normalized.includes('buffer') && normalized.includes('empty')) ||
      message.includes('缓冲区为空') ||
      message.includes('不能为空')
    )
  }

  private appendSentenceBuffer(sessionKey: string, text: string): void {
    const current = this.sessionSentenceBuffers.get(sessionKey) || ''
    this.sessionSentenceBuffers.set(sessionKey, `${current}${text}`)
  }

  private shouldCommitSentence(sessionKey: string): boolean {
    const raw = this.sessionSentenceBuffers.get(sessionKey) || ''
    const buffered = raw.trim()
    if (!buffered) {
      return false
    }

    return (
      SENTENCE_END_RE.test(buffered) ||
      (buffered.length >= SOFT_COMMIT_LENGTH && /\s$/.test(raw))
    )
  }

  private async commitPendingText(
    message: InboundMessage,
    instance: BaseTTS
  ): Promise<boolean> {
    const sessionKey = message.sessionKey
    try {
      await instance.commit()
      this.sessionHasPendingText.set(sessionKey, false)
      this.sessionSentenceBuffers.set(sessionKey, '')
      return true
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown commit error.'

      if (!this.isIgnorableEmptyBufferError(reason)) {
        if (!this.shouldDropAfterAbort(message)) {
          this.publishError(message, `Failed to commit TTS session: ${reason}`)
        }
        return false
      }

      logger.warn(`[TTSManager] Ignoring empty buffer commit error: ${reason}`)
      this.sessionHasPendingText.set(sessionKey, false)
      this.sessionSentenceBuffers.set(sessionKey, '')
      return true
    }
  }

  private sanitizeSpeechText(value: string): string {
    // 面向流式文本的轻量清洗：保留自然句末标点用于断句，但去掉 Markdown、
    // URL、代码片段和容易被 TTS 读成“符号名称”的字符。这里不追求完美 Markdown
    // 解析，因为输入是 delta 流，完整语法块可能跨多次消息才出现。
    return value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~>#|[\]{}\\]/g, ' ')
      .replace(/[<>=`$^]/g, ' ')
      .replace(/\s+/g, ' ')
  }
}
