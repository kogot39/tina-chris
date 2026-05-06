import { getModel, getModels } from '@mariozechner/pi-ai'

import type { DynamicFormSchema } from '@tina-chris/tina-ui'
import type { Api, KnownProvider, Model } from '@mariozechner/pi-ai'

export class ApiKeyLLMConfig {
  model: string = ''
  apiKey: string = ''
}

// 当前先只支持基于 API Key 的内置 pi LLM 供应商
export type LLMFactoryConfig = ApiKeyLLMConfig

type ApiKeyDefinition = {
  provider: KnownProvider
  title: string
  description: string
  apiKeyLabel: string
  apiKeyHint: string
  // 可选的模型选项列表
  modelOptions: Model<Api>[]
}

// apiKeyForm 模板函数
const createApiKeyForm = ({
  provider,
  title,
  apiKeyLabel,
  apiKeyHint,
  modelOptions,
}: ApiKeyDefinition): DynamicFormSchema => ({
  key: `llm-${provider}`,
  legend: `${title} 配置`,
  saveText: '保存并应用',
  fields: [
    {
      name: 'apiKey',
      type: 'input',
      label: apiKeyLabel,
      hint: apiKeyHint,
      required: true,
      valueType: 'string',
      rules: [{ type: 'required', message: `请输入 ${apiKeyLabel}` }],
      componentProps: {
        type: 'password',
        autocomplete: 'off',
        placeholder: 'sk-xxxx',
      },
    },
    {
      name: 'model',
      type: 'select',
      label: '模型',
      hint: '请选择您要使用的模型',
      required: true,
      valueType: 'string',
      rules: [{ type: 'required', message: '请选择模型' }],
      componentProps: {
        placeholder: '请选择模型',
        options: modelOptions.map((m) => ({ label: m.name, value: m.id })),
      },
    },
  ],
})

export type LLMProvider = {
  title: string
  description: string
  create: (config: LLMFactoryConfig) => Model<Api>
  form: () => DynamicFormSchema
}

//  这里先支持常见的 LLM 供应商
export const piProvidersMap: Record<string, LLMProvider> = {
  openai: {
    title: 'OpenAI',
    description: '使用 OpenAI 官方 Responses API 模型。',
    create: (config) => getModel('openai', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'openai',
        title: 'OpenAI',
        description: '使用 OpenAI 官方 Responses API 模型。',
        apiKeyLabel: 'OpenAI API Key',
        apiKeyHint: '请填写 OPENAI_API_KEY',
        modelOptions: getModels('openai'),
      }),
  },
  anthropic: {
    title: 'Anthropic',
    description: '使用 Anthropic Claude Messages API 模型。',
    create: (config) => getModel('anthropic', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'anthropic',
        title: 'Anthropic',
        description: '使用 Anthropic Claude Messages API 模型。',
        apiKeyLabel: 'Anthropic API Key',
        apiKeyHint: '请填写 ANTHROPIC_API_KEY',
        modelOptions: getModels('anthropic'),
      }),
  },
  google: {
    title: 'Google Gemini',
    description: '使用 Google Gemini API 模型。',
    create: (config) => getModel('google', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'google',
        title: 'Google Gemini',
        description: '使用 Google Gemini API 模型。',
        apiKeyLabel: 'Gemini API Key',
        apiKeyHint: '请填写 GOOGLE_API_KEY',
        modelOptions: getModels('google'),
      }),
  },
  deepseek: {
    title: 'Deepseek',
    description: '使用 Deepseek API 模型。',
    create: (config) => getModel('deepseek', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'deepseek',
        title: 'Deepseek',
        description: '使用 Deepseek API 模型。',
        apiKeyLabel: 'Deepseek API Key',
        apiKeyHint: '请填写 DEEPSEEK_API_KEY',
        modelOptions: getModels('deepseek'),
      }),
  },
  mistral: {
    title: 'Mistral',
    description: '使用 Mistral Conversations API 模型。',
    create: (config) => getModel('mistral', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'mistral',
        title: 'Mistral',
        description: '使用 Mistral Conversations API 模型。',
        apiKeyLabel: 'Mistral API Key',
        apiKeyHint: '请填写 MISTRAL_API_KEY',
        modelOptions: getModels('mistral'),
      }),
  },
  groq: {
    title: 'Groq',
    description: '使用 Groq API 模型。',
    create: (config) => getModel('groq', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'groq',
        title: 'Groq',
        description: '使用 Groq API 模型。',
        apiKeyLabel: 'Groq API Key',
        apiKeyHint: '请填写 GROQ_API_KEY',
        modelOptions: getModels('groq'),
      }),
  },
  cerebras: {
    title: 'Cerebras',
    description: '使用 Cerebras API 模型。',
    create: (config) => getModel('cerebras', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'cerebras',
        title: 'Cerebras',
        description: '使用 Cerebras API 模型。',
        apiKeyLabel: 'Cerebras API Key',
        apiKeyHint: '请填写 CEREBRAS_API_KEY',
        modelOptions: getModels('cerebras'),
      }),
  },
  xai: {
    title: 'xAI',
    description: '使用 xAI API 模型。',
    create: (config) => getModel('xai', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'xai',
        title: 'xAI',
        description: '使用 xAI API 模型。',
        apiKeyLabel: 'xAI API Key',
        apiKeyHint: '请填写 XAI_API_KEY',
        modelOptions: getModels('xai'),
      }),
  },
  openrouter: {
    title: 'OpenRouter',
    description: '使用 OpenRouter API 模型。',
    create: (config) => getModel('openrouter', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'openrouter',
        title: 'OpenRouter',
        description: '使用 OpenRouter API 模型。',
        apiKeyLabel: 'OpenRouter API Key',
        apiKeyHint: '请填写 OPENROUTER_API_KEY',
        modelOptions: getModels('openrouter'),
      }),
  },
  minimax: {
    title: 'Minimax',
    description: '使用 Minimax API 模型。',
    create: (config) => getModel('minimax', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'minimax',
        title: 'Minimax',
        description: '使用 Minimax API 模型。',
        apiKeyLabel: 'Minimax API Key',
        apiKeyHint: '请填写 MINIMAX_API_KEY',
        modelOptions: getModels('minimax'),
      }),
  },
  moonshotai: {
    title: 'MoonshotAI',
    description: '使用 MoonshotAI API 模型。',
    create: (config) => getModel('moonshotai', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'moonshotai',
        title: 'MoonshotAI',
        description: '使用 MoonshotAI API 模型。',
        apiKeyLabel: 'MoonshotAI API Key',
        apiKeyHint: '请填写 MOONSHOTAI_API_KEY',
        modelOptions: getModels('moonshotai'),
      }),
  },
  fireworks: {
    title: 'Fireworks',
    description: '使用 Fireworks API 模型。',
    create: (config) => getModel('fireworks', config.model as any),
    form: () =>
      createApiKeyForm({
        provider: 'fireworks',
        title: 'Fireworks',
        description: '使用 Fireworks API 模型。',
        apiKeyLabel: 'Fireworks API Key',
        apiKeyHint: '请填写 FIREWORKS_API_KEY',
        modelOptions: getModels('fireworks'),
      }),
  },
}

export type LLMProviderKey = keyof typeof piProvidersMap
