import { ListDirTool, ReadFileTool } from './filesystem'
import { MessageTool } from './message'
import { ToolRegistry } from './registry'
import { WebFetchTool, WebSearchTool } from './web'
import { ReadMemoryTool, UpdateMemoryTool } from './memory'

import type { MessageBus } from '@tina-chris/tina-bus'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import type { Config } from '@/config'
import type { MemoryStore } from '@/memory'

// TODO: 后续一个工具类型单独作为一个模块去做管理，目前先放在这里以免过早抽象。
export type ToolTypeKey = 'webSearch'
export type ToolProviderKey = 'bocha'

type ToolProvider = {
  title: string
  description: string
  form: () => DynamicFormSchema
}

type ToolTypeDefinition = {
  title: string
  description: string
  providers: Record<string, ToolProvider>
}

type BochaSearchConfig = {
  apiKey: string
  maxResults: number
}

export type ToolRuntimeContext = {
  config: Config
  workspacePath: string
  bus: MessageBus
  // memoryStore 由 AgentLoop 初始化时创建，保证工具读写的是当前 workspace 的 memory 目录。
  memoryStore: MemoryStore
}

const getBochaConfigForm = (): DynamicFormSchema => ({
  key: 'tool-webSearch-bocha',
  legend: 'Bocha 网页搜索配置',
  saveText: '保存并启用',
  fields: [
    {
      name: 'apiKey',
      type: 'input',
      label: 'API Key',
      hint: 'Bocha Search API Key，用于 Agent 的 web_search 工具。',
      required: true,
      valueType: 'string',
      rules: [{ type: 'required', message: '请输入 Bocha API Key' }],
      componentProps: {
        type: 'password',
        autocomplete: 'off',
      },
    },
    {
      name: 'maxResults',
      type: 'input',
      label: '默认结果数',
      hint: '默认搜索结果数量，范围 1-10。',
      valueType: 'number',
      defaultValue: 5,
      componentProps: {
        type: 'number',
        min: 1,
        max: 10,
        step: 1,
      },
    },
  ],
})

const TOOL_TYPES: Record<ToolTypeKey, ToolTypeDefinition> = {
  webSearch: {
    title: '网页搜索',
    description: '配置 Agent 可使用的网页搜索供应平台。',
    providers: {
      bocha: {
        title: 'Bocha Search',
        description: '使用 Bocha API 进行网页搜索，适合当前地区网络环境。',
        form: getBochaConfigForm,
      },
    },
  },
}

export const getAvailableToolTypes = () => {
  return Object.entries(TOOL_TYPES).map(([key, value]) => ({
    key,
    title: value.title,
    description: value.description,
  }))
}

export const getAvailableToolProviders = (toolType: string) => {
  const definition = TOOL_TYPES[toolType as ToolTypeKey]
  if (!definition) {
    return []
  }

  return Object.entries(definition.providers).map(([key, value]) => ({
    key,
    title: value.title,
    description: value.description,
  }))
}

export const getToolConfigFormByKey = (
  toolType: string,
  providerKey: string
): DynamicFormSchema | null => {
  const provider =
    TOOL_TYPES[toolType as ToolTypeKey]?.providers[
      providerKey as ToolProviderKey
    ]
  return provider ? provider.form() : null
}

export const isSupportedToolType = (
  toolType: string
): toolType is ToolTypeKey => {
  return toolType in TOOL_TYPES
}

export const isSupportedToolProvider = (
  toolType: string,
  providerKey: string
): boolean => {
  return Boolean(
    TOOL_TYPES[toolType as ToolTypeKey]?.providers[
      providerKey as ToolProviderKey
    ]
  )
}

export const createDefaultToolRegistry = ({
  config,
  workspacePath,
  bus,
  memoryStore,
}: ToolRuntimeContext): ToolRegistry => {
  const registry = new ToolRegistry()
  // 基础工具：文件系统访问和消息发送。这些工具不依赖外部 API，默认注册在系统里供 Agent 使用
  // 安全起见只提供了 read_file 和 list_dir 两个工具，且会限制访问路径在 workspace 内，避免 Agent 直接接触底层文件系统
  registry.register(new ReadFileTool(workspacePath))
  registry.register(new ListDirTool(workspacePath))
  registry.register(new WebFetchTool())
  // 记忆工具围绕 MEMORY.md 目录定位长期记忆，避免把整份长期记忆默认塞进上下文。
  registry.register(new ReadMemoryTool(memoryStore))
  registry.register(new UpdateMemoryTool(memoryStore))

  // 消息工具需要运行时上下文支持，因此放在这里动态注册
  // Agent 可以通过它主动发送消息到前端
  // 会话过程会自动更新上下文中的 channel 和 chatId，以支持多轮对话和多 Agent 协作场景
  registry.register(new MessageTool(bus))

  // 可选工具：网页搜索。根据配置动态注册
  // TODO: 当前只支持这一种搜索工具，后续每个需进行配置的工具每种类型单独做一个 manager 来注册，类似 STT/TTS/LLM 的 manager
  const webSearchConfig = config.getToolConfig('webSearch') as
    | BochaSearchConfig
    | undefined
  if (config.tools.webSearch.current === 'bocha' && webSearchConfig?.apiKey) {
    registry.register(
      new WebSearchTool(webSearchConfig.apiKey, webSearchConfig.maxResults || 5)
    )
  }

  return registry
}
