import { BaseLLM, type ChatArguments } from './lib/base'
import {
  CustomLLM,
  type CustomLLMConfig,
  getCustomLLMConfigForm,
} from './lib/custom/customLLM'

import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import { Config } from '@/config'

// 目前仅适配 custom 这一类 OpenAI-compatible 的 LLM 配置；
// 后续新增 provider 时，只需要在这里扩展联合类型与映射表。
type LLMFactoryConfig = CustomLLMConfig

export type LLMProvider = {
  title: string
  description: string
  create: (config: LLMFactoryConfig) => BaseLLM
  form: () => DynamicFormSchema
}
// LLMMap 是一个静态映射表，定义了每个 provider key 对应的显示信息、实例化函数和配置表单函数；
const LLMMap = {
  custom: {
    title: 'Custom LLM',
    description:
      '基于 OpenAI 接口规范的自定义大模型接入，可配置 API Key 与 API Base 接入兼容服务。',
    create: (config: LLMFactoryConfig) =>
      new CustomLLM(config as CustomLLMConfig),
    form: () => getCustomLLMConfigForm(),
  },
} as const satisfies Record<string, LLMProvider>

export type LLMProviderKey = keyof typeof LLMMap

// LLMManager 只负责把 AgentLoop 传入的上下文/工具/推理参数交给当前 provider。
// 因此这里不主动读取总线消息，也不承担 session/history 的组织职责。
export type LLMManagerChatArguments = ChatArguments

// 获取可用的 LLM provider 列表，供前端展示选择。
export const getAvailableLLMs = () => {
  return Object.entries(LLMMap).map(([key, value]) => ({
    key,
    title: value.title,
    description: value.description,
  }))
}
// 根据 provider key 获取对应的配置表单 schema，供前端动态渲染配置界面使用。
export const getLLMConfigFormByKey = (
  key: string
): DynamicFormSchema | null => {
  const provider = LLMMap[key as LLMProviderKey]
  if (!provider) {
    return null
  }

  return provider.form()
}

export class LLMManager {
  // 运行时总配置对象，仅用于读取当前启用的 LLM provider 及其配置。
  private config: Config
  // LLM 本身没有按 session 隔离实例的需求，只缓存“当前 provider”的实例即可。
  private currentInstance: BaseLLM | null = null
  private currentProviderKey = ''

  constructor(config: Config) {
    this.config = config
  }

  private getCurrentProviderKey(): string {
    return this.config.llm.current
  }
  // 获取当前启用的 provider 实例，如果配置不完整或未启用则返回 null。
  private getCurrentProvider(): LLMProvider | null {
    const current = this.getCurrentProviderKey()
    if (!current) return null

    return LLMMap[current as LLMProviderKey] ?? null
  }
  // 获取当前 provider 的配置项，供实例化时使用；如果 provider 配置不完整则返回 null。
  private getCurrentProviderConfig(): LLMFactoryConfig | null {
    const provider = this.getCurrentProvider()
    if (!provider) return null

    const config = this.config.getConfig('llm')
    if (!config) return null

    return config as LLMFactoryConfig
  }
  // 根据当前配置的 provider key 获取对应的 LLM 实例，如果实例已存在且 provider 未变化则复用，否则创建新实例。
  private getCurrentInstance(): BaseLLM | null {
    const provider = this.getCurrentProvider()
    const providerConfig = this.getCurrentProviderConfig()
    const providerKey = this.getCurrentProviderKey()

    if (!provider || !providerConfig || !providerKey) {
      return null
    }

    // 当 provider 未变化时复用实例，避免频繁重建底层 SDK client。
    if (this.currentInstance && this.currentProviderKey === providerKey) {
      return this.currentInstance
    }

    this.currentInstance = provider.create(providerConfig)
    this.currentProviderKey = providerKey

    return this.currentInstance
  }

  getCurrentLLMConfigForm(): DynamicFormSchema | null {
    const provider = this.getCurrentProvider()
    if (!provider) {
      return null
    }

    return provider.form()
  }

  async chat({
    messages,
    tools = [],
    model,
    maxTokens,
    temperature,
    stream = false,
    streamId,
    onChunk,
  }: LLMManagerChatArguments) {
    const instance = this.getCurrentInstance()
    if (!instance) {
      throw new Error('LLM service is not configured.')
    }

    // AgentLoop 会在上层组织完整的上下文、工具定义与推理参数；
    // 这里仅做最薄的一层 provider 转发与当前实例选择。
    return instance.chat({
      messages,
      tools,
      model,
      maxTokens,
      temperature,
      stream,
      streamId,
      onChunk,
    })
  }

  // 当用户在设置页切换 provider 或修改认证信息后，显式清空缓存实例。
  // 后续第一次 chat 时会按最新配置重新创建 provider。
  reset(): void {
    this.currentInstance = null
    this.currentProviderKey = ''
  }
}
