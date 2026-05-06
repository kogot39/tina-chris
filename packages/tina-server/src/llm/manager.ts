import {
  type LLMFactoryConfig,
  type LLMProvider,
  type LLMProviderKey,
  piProvidersMap,
} from './piProviders'
import { completeSimple, streamSimple } from '@mariozechner/pi-ai'

import type {
  LLMCallArguments,
  LLMEventCallbacks,
  LLMStreamArguments,
} from './piLLM'
import type {
  Api,
  AssistantMessageEvent,
  Model,
  SimpleStreamOptions,
} from '@mariozechner/pi-ai'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import { Config } from '@/config'

export const getAvailableLLMs = () => {
  return Object.entries(piProvidersMap).map(([key, value]) => ({
    key,
    title: value.title,
    description: value.description,
  }))
}

export const getLLMConfigFormByKey = (
  key: string
): DynamicFormSchema | null => {
  const provider = piProvidersMap[key as LLMProviderKey]
  return provider ? provider.form() : null
}

export class LLMManager {
  private currentInstance: Model<Api> | null = null
  private currentProviderKey = ''

  constructor(private config: Config) {}

  private buildOptions(
    model: Model<Api>,
    args: LLMCallArguments
  ): SimpleStreamOptions {
    const options: SimpleStreamOptions = {
      // getCurrentInstance 已经检查过 provider 和 config 的有效性，这里直接取 apiKey 就行
      apiKey: this.getCurrentProviderConfig()?.apiKey,
      temperature: args.temperature,
      signal: args.signal,
      sessionId: args.sessionId,
    }

    // maxTokens=null 的约定是“完全不传”，让 provider 使用默认配置；
    // 因此只有用户明确填写了有限数字时才放进 options
    if (typeof args.maxTokens === 'number' && Number.isFinite(args.maxTokens)) {
      options.maxTokens = args.maxTokens
    }

    // 检查思考模式支持性
    if (
      args.reasoningEffort &&
      args.reasoningEffort !== 'off' &&
      model.reasoning
    ) {
      options.reasoning = args.reasoningEffort
    }

    return options
  }

  private getCurrentProviderKey(): string {
    return this.config.llm.current
  }

  private getCurrentProvider(): LLMProvider | null {
    const current = this.getCurrentProviderKey()
    return current ? (piProvidersMap[current as LLMProviderKey] ?? null) : null
  }

  private getCurrentProviderConfig(): LLMFactoryConfig | null {
    const provider = this.getCurrentProvider()
    if (!provider) return null

    const config = this.config.getConfig('llm')
    return config ? (config as LLMFactoryConfig) : null
  }

  private getCurrentInstance(): Model<Api> {
    const provider = this.getCurrentProvider()
    const providerConfig = this.getCurrentProviderConfig()
    const providerKey = this.getCurrentProviderKey()

    if (!provider || !providerConfig || !providerKey) {
      throw new Error('LLM service is not configured.')
    }

    // LLM 实例只按当前 provider 缓存。保存 LLM 配置后 desktop main 会调用 reset()，
    // 这样同一 provider 的 API Key/API Base 更新也能在下一次请求重新实例化。
    if (this.currentInstance && this.currentProviderKey === providerKey) {
      return this.currentInstance
    }

    this.currentInstance = provider.create(providerConfig)
    this.currentProviderKey = providerKey
    return this.currentInstance
  }

  getCurrentLLMConfigForm(): DynamicFormSchema | null {
    return this.getCurrentProvider()?.form() ?? null
  }

  async stream(args: LLMStreamArguments) {
    // 这里先使用统一接口简化实现
    // TODO: 后续根据不同 provider 的能力差异，增加更细粒度的 stream/complete 实现，充分利用 pi-ai 。
    const eventStream = streamSimple(
      this.getCurrentInstance(),
      args.context,
      this.buildOptions(this.getCurrentInstance(), args)
    )

    // pi-ai 的 AssistantMessageEventStream 同时是 async iterable 和最终结果容器。
    // Manager 在这里消费事件并分发回调，最后仍返回 eventStream.result()
    // 得到完整 AssistantMessage，供 loop 落盘和工具轮次判断。
    for await (const event of eventStream) {
      await this.dispatchEvent(event, args.callbacks)
    }

    return eventStream.result()
  }

  complete(args: LLMCallArguments) {
    return completeSimple(
      this.getCurrentInstance(),
      args.context,
      this.buildOptions(this.getCurrentInstance(), args)
    )
  }

  reset(): void {
    this.currentInstance = null
    this.currentProviderKey = ''
  }

  private async dispatchEvent(
    event: AssistantMessageEvent,
    callbacks: LLMEventCallbacks | undefined
  ): Promise<void> {
    // onEvent 是调试/日志用的总入口，随后再分派到语义化事件回调。
    // 这样调用方既可以订阅所有 pi-ai 原始事件，也可以只关心某一类增量。
    await callbacks?.onEvent?.(event)

    switch (event.type) {
      case 'start':
        await callbacks?.onStart?.(event)
        break
      case 'text_start':
        await callbacks?.onTextStart?.(event)
        break
      case 'text_delta':
        await callbacks?.onTextDelta?.(event)
        break
      case 'text_end':
        await callbacks?.onTextEnd?.(event)
        break
      case 'thinking_start':
        await callbacks?.onThinkingStart?.(event)
        break
      case 'thinking_delta':
        await callbacks?.onThinkingDelta?.(event)
        break
      case 'thinking_end':
        await callbacks?.onThinkingEnd?.(event)
        break
      case 'toolcall_start':
        await callbacks?.onToolCallStart?.(event)
        break
      case 'toolcall_delta':
        await callbacks?.onToolCallDelta?.(event)
        break
      case 'toolcall_end':
        await callbacks?.onToolCallEnd?.(event)
        break
      case 'done':
        await callbacks?.onDone?.(event)
        break
      case 'error':
        // pi-ai 用 error event 承载 error 和 aborted 两种终止；Tina 额外触发
        // onAborted，避免业务层把用户主动停止当成真正故障处理。
        if (event.reason === 'aborted') {
          await callbacks?.onAborted?.(event)
        }
        await callbacks?.onError?.(event)
        break
      default: {
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }
}
