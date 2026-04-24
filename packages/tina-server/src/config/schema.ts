import { CustomLLMConfig } from '@/llm/lib/custom/customLLM'
import { QwenSTTConfig } from '@/stt'
import { QwenTTSConfig } from '@/tts/lib/qwen/qwenTTS'

// 这里只展示用户可以编辑的字段。
class TTSConfigs {
  current: 'qwen' | '' = ''
  qwen: QwenTTSConfig = new QwenTTSConfig()
}

class STTConfigs {
  current: 'qwen' | '' = ''
  qwen: QwenSTTConfig = new QwenSTTConfig()
}

class LLMConfigs {
  current: 'custom' | '' = ''
  custom: CustomLLMConfig = new CustomLLMConfig()
}

// TODO: 里面的部分字段界限可能不太清晰，后续可能需要调整并配合前端进行更详细的说明
// 可配置项的集合，供 AgentLoop 在运行时使用，同时也是用户在配置界面中可以编辑的字段。

// USER.md 用户信息和偏好设置，供 AgentLoop 在与用户交互时参考。
export class AgentUserProfileConfig {
  name: string = ''
  timezone: string = ''
  language: string = ''
  communicationStyle: string = '' // 用户希望的沟通风格（选项式）
  responseLength: string = ''
  technicalLevel: string = ''
  primaryRole: string = ''
  interestsAndHobbies: string = '' // 新增兴趣爱好字段
  personalHabits: string = '' // 新增个人习惯字段
  specialInstructions: string = ''
}

// AGENT.md agent的身份、行为准则、额外指令等信息，供 AgentLoop 在决策时参考。
export class AgentPromptConfig {
  identity: string = '' // 第三人称的身份介绍
  guidelines: string = ''
  additionalInstructions: string = ''
}

// SOUL.md soul的信息，可自定义配置 Agent 的角色身份、个性特征、核心价值观、沟通风格等，供 AgentLoop 在生成内容时参考。
export class SoulPromptConfig {
  identity: string = '' // 第一人称的身份介绍
  personalityTraits: string = ''
  coreValues: string = ''
  communicationStyle: string = '' // 自定义的沟通风格描述
  additionalNotes: string = ''
}

// Agent config serves 两个目的：
// 1. 作为 AgentLoop 在运行时的配置来源，包含用户信息、agent信息、LLM和工具的使用偏好等，供 AgentLoop 在决策和生成内容时参考。
// 2. 作为用户在配置界面中可以编辑的字段集合，用户可以通过界面修改这些字段来调整 Agent 的行为和输出。
export class AgentConfig {
  workspace: string = ''
  // 在这里指定模型名称，主要是部分供应商支持各种不同厂商的模型，
  // 同时模型名在使用过程是作为chat接口的参数存在的，所以放在这里比较合适
  model: string = ''
  maxTokens: number = 8192
  temperature: number = 0.7
  maxToolInteractions: number = 20

  userProfile: AgentUserProfileConfig = new AgentUserProfileConfig()
  agentPrompt: AgentPromptConfig = new AgentPromptConfig()
  soulPrompt: SoulPromptConfig = new SoulPromptConfig()
}

class BochaSearchConfig {
  apiKey: string = ''
  maxResults: number = 5
}

class WebSearchToolsConfig {
  current: 'bocha' | '' = ''
  bocha: BochaSearchConfig = new BochaSearchConfig()
}

class ToolsConfig {
  webSearch: WebSearchToolsConfig = new WebSearchToolsConfig()
}

type PlainObject = Record<string, unknown>

const isPlainObject = (value: unknown): value is PlainObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 根据目标对象的结构来合并源对象的数据，只会合并目标对象中已经存在的字段，
// 且仅当源对象中的对应字段类型与目标对象中的相同（都是普通对象）时才会进行递归合并，否则直接覆盖。
// 这样可以确保配置的结构不被破坏，同时允许用户更新已有字段的值。
const mergeByShape = (target: PlainObject, source: unknown): void => {
  if (!isPlainObject(source)) {
    return
  }

  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      continue
    }

    const targetValue = target[key]
    const sourceValue = source[key]

    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergeByShape(targetValue, sourceValue)
      continue
    }

    if (sourceValue !== undefined) {
      target[key] = sourceValue
    }
  }
}

export class Config {
  tts: TTSConfigs = new TTSConfigs()
  stt: STTConfigs = new STTConfigs()
  agent: AgentConfig = new AgentConfig()
  llm: LLMConfigs = new LLMConfigs()
  tools: ToolsConfig = new ToolsConfig()

  getConfig(type: 'tts' | 'stt' | 'agent' | 'llm') {
    if (type === 'agent') {
      return this.agent
    }

    const configGroup = this[type] as unknown as PlainObject
    const current = configGroup.current
    if (typeof current !== 'string' || current.length === 0) {
      return undefined
    }

    return configGroup[current]
  }

  getToolConfig(toolType: string) {
    const toolGroup = (this.tools as unknown as PlainObject)[toolType]
    if (!isPlainObject(toolGroup)) {
      return undefined
    }

    const current = toolGroup.current
    if (typeof current !== 'string' || current.length === 0) {
      return undefined
    }

    return toolGroup[current]
  }

  updateConfig(
    type: 'tts' | 'stt' | 'agent' | 'llm',
    newCurrent: string,
    configData: Record<string, any>
  ) {
    if (type === 'agent') {
      mergeByShape(this.agent as unknown as PlainObject, configData)
      return
    }

    const configGroup = this[type] as unknown as PlainObject
    const nextConfig = configGroup[newCurrent]
    if (!isPlainObject(nextConfig)) {
      return
    }

    configGroup.current = newCurrent
    mergeByShape(nextConfig, configData)
  }

  updateToolConfig(
    toolType: string,
    newCurrent: string,
    configData: Record<string, any>
  ) {
    const toolGroup = (this.tools as unknown as PlainObject)[toolType]
    if (!isPlainObject(toolGroup)) {
      return
    }

    const nextConfig = toolGroup[newCurrent]
    if (!isPlainObject(nextConfig)) {
      return
    }

    toolGroup.current = newCurrent
    mergeByShape(nextConfig, configData)
  }

  static createConfig(configData: Record<string, any>): Config {
    const config = new Config()
    mergeByShape(config as unknown as PlainObject, configData)
    return config
  }
}
