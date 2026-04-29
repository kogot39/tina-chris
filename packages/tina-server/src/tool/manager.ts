import { ListDirTool, ReadFileTool } from './filesystem'
import { MessageTool } from './message'
import { ToolRegistry } from './registry'
import { SpawnSubagentTool } from './spawn'
import { WebFetchTool, WebSearchTool } from './web'
import { AppendDailyMemoryTool, ReadMemoryTool, RememberTool } from './memory'

import type { MessageBus } from '@tina-chris/tina-bus'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import type { Config } from '@/config'
import type { SubagentManager } from '@/agent/subagent'
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
  // subagentManager 在主 Agent 工具注册表中可用；子代理自己的工具注册表不会再传入它。
  subagentManager?: SubagentManager
}

export type SubagentToolRuntimeContext = {
  config: Config
  workspacePath: string
  memoryStore: MemoryStore
  // 子代理 readMemory 默认读取原始对话的 session summary，而不是子代理自己的临时上下文。
  sessionKey: string
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
  subagentManager,
}: ToolRuntimeContext): ToolRegistry => {
  const registry = new ToolRegistry()
  // 基础工具：文件系统访问和消息发送。这些工具不依赖外部 API，默认注册在系统里供 Agent 使用
  // 安全起见只提供了 read_file 和 list_dir 两个工具，且会限制访问路径在 workspace 内，避免 Agent 直接接触底层文件系统
  registry.register(new ReadFileTool(workspacePath))
  registry.register(new ListDirTool(workspacePath))
  registry.register(new WebFetchTool())
  // 记忆工具是专用受控写入入口：
  // remember/appendDailyMemory 只能写 workspace/memory，不开放通用写文件能力。
  registry.register(new ReadMemoryTool(memoryStore))
  registry.register(new RememberTool(memoryStore))
  registry.register(new AppendDailyMemoryTool(memoryStore))

  // 消息工具需要运行时上下文支持，因此放在这里动态注册
  // Agent 可以通过它主动发送消息到前端
  // 会话过程会自动更新上下文中的 channel 和 chatId，以支持多轮对话和多 Agent 协作场景
  registry.register(new MessageTool(bus))
  if (subagentManager) {
    // spawnSubagent 只注册给主 Agent。子代理注册表不会包含该工具，避免递归派生。
    registry.register(new SpawnSubagentTool(subagentManager))
  }

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

export const createSubagentToolRegistry = ({
  config,
  workspacePath,
  memoryStore,
  sessionKey,
}: SubagentToolRuntimeContext): ToolRegistry => {
  const registry = new ToolRegistry()

  // 子代理工具集刻意比主 Agent 更窄：
  // 只允许读取 workspace、搜索/抓取网页和读取记忆，不允许发消息、写文件、执行 shell 或再次 spawn。
  registry.register(new ReadFileTool(workspacePath))
  registry.register(new ListDirTool(workspacePath))
  registry.register(new WebFetchTool())

  const readMemoryTool = new ReadMemoryTool(memoryStore)
  readMemoryTool.setContext(sessionKey)
  registry.register(readMemoryTool)

  // web_search 仍然沿用用户的工具配置；未配置 API Key 时不注册，避免模型看到不可用工具。
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
