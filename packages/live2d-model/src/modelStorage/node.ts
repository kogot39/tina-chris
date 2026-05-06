import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import {
  DEFAULT_MODEL_ENTRY,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_NAME,
  MODEL_STATE_FILE,
  createDefaultStoreState,
  findModelById,
  parseModelProtocolUrl,
  toActiveModelInfo,
} from './shared'

import type { ActiveModelInfo, ModelStoreState, StoredModelItem } from './types'

/**
 * 初始化模型仓库所需参数：
 * - modelRootDir: 用户本地模型根目录（.model）
 * - defaultModelSourceDir: 内置默认模型资源目录
 * - defaultModelEntry: 默认模型入口文件（通常是 *.model3.json）
 */
type EnsureModelStoreOptions = {
  modelRootDir: string
  defaultModelSourceDir: string
  defaultModelEntry?: string
}

/**
 * 导入用户自定义模型时的参数：
 * - modelJsonPath: 用户选中的 .model3.json 文件绝对路径
 * - modelName: 可选自定义模型名称，不传则从文件名推导
 */
type ImportModelOptions = {
  modelRootDir: string
  modelJsonPath: string
  modelName?: string
}

/**
 * 将入口文件路径标准化为 URL 友好的相对路径：
 * 1. Windows 反斜杠转为正斜杠
 * 2. 去掉前导斜杠，确保后续拼接行为稳定
 */
const normalizeModelEntry = (entryFile: string) => {
  return entryFile.replace(/\\/g, '/').replace(/^\/+/, '')
}

/**
 * 获取模型状态文件路径（models.json）。
 */
const stateFilePath = (modelRootDir: string) => {
  return join(modelRootDir, MODEL_STATE_FILE)
}

/**
 * 获取某个模型的目录路径。
 */
const modelFolderPath = (modelRootDir: string, modelId: string) => {
  return join(modelRootDir, modelId)
}

/**
 * 确保目录存在（不存在时递归创建）。
 */
const ensureDirectory = async (dirPath: string) => {
  await mkdir(dirPath, { recursive: true })
}

/**
 * 复制整个目录（用于导入模型目录或初始化默认模型目录）。
 * force=true 允许覆盖已有文件，减少增量更新复杂度。
 */
const copyDirectory = async (from: string, to: string) => {
  await cp(from, to, {
    recursive: true,
    force: true,
  })
}

/**
 * 读取模型状态文件并反序列化。
 * 约定：调用方保证状态文件已存在。
 */
const readStoreState = async (
  modelRootDir: string
): Promise<ModelStoreState> => {
  const filePath = stateFilePath(modelRootDir)
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as ModelStoreState
}

/**
 * 将内存态模型信息写回状态文件。
 */
const writeStoreState = async (
  modelRootDir: string,
  state: ModelStoreState
) => {
  const filePath = stateFilePath(modelRootDir)
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
}

/**
 * 确保状态文件存在：
 * - 存在则直接读取
 * - 不存在则创建默认状态并返回
 */
const ensureStoreState = async (modelRootDir: string) => {
  const filePath = stateFilePath(modelRootDir)

  try {
    await stat(filePath)
    return readStoreState(modelRootDir)
  } catch {
    const next = createDefaultStoreState()
    await writeStoreState(modelRootDir, next)
    return next
  }
}

/**
 * 确保默认模型目录存在且入口文件可用。
 *
 * 这里不能只判断 default 目录是否存在：早期打包配置如果没有把 public 正确解包，
 * 可能会在用户目录留下一个不完整的 default 目录。后续版本启动时需要能自动补齐资源，
 * 否则 models.json 中虽然有默认模型记录，实际 tina-model:// 协议仍然会 404。
 */
const ensureDefaultModelExists = async (
  modelRootDir: string,
  defaultModelSourceDir: string,
  defaultModelEntry: string
) => {
  const defaultTargetDir = modelFolderPath(modelRootDir, DEFAULT_MODEL_ID)
  const defaultTargetEntry = join(defaultTargetDir, defaultModelEntry)

  try {
    const currentEntry = await stat(defaultTargetEntry)
    if (currentEntry.isFile()) {
      return
    }
  } catch {
    // 缺少入口文件时继续走复制流程，补齐安装包内置的默认模型资源。
  }

  const defaultSourceEntry = join(defaultModelSourceDir, defaultModelEntry)
  try {
    const sourceEntry = await stat(defaultSourceEntry)
    if (!sourceEntry.isFile()) {
      throw new Error('default model entry is not a file')
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Default model asset is missing: ${defaultSourceEntry}. ${reason}`
    )
  }

  try {
    const currentTarget = await stat(defaultTargetDir)
    if (!currentTarget.isDirectory()) {
      await rm(defaultTargetDir, { recursive: true, force: true })
    }
  } catch {
    // 目标目录不存在是初始化默认模型时的正常路径。
  }

  await copyDirectory(defaultModelSourceDir, defaultTargetDir)
}

/**
 * 在状态文件中“插入或更新”默认模型记录：
 * - 记录不存在时新增
 * - 存在时仅更新入口文件与更新时间
 */
const upsertDefaultModel = (state: ModelStoreState, entryFile: string) => {
  const normalizedEntry = normalizeModelEntry(entryFile)
  const existing = state.models.find((item) => item.id === DEFAULT_MODEL_ID)
  const now = Date.now()

  if (existing) {
    existing.entryFile = normalizedEntry
    existing.updatedAt = now
  } else {
    state.models.unshift({
      id: DEFAULT_MODEL_ID,
      name: DEFAULT_MODEL_NAME,
      entryFile: normalizedEntry,
      source: 'builtin',
      createdAt: now,
      updatedAt: now,
    })
  }

  if (!state.activeModelId) {
    state.activeModelId = DEFAULT_MODEL_ID
  }
}

/**
 * 确保当前激活模型 id 合法：
 * 若当前 activeModelId 不存在于 models 中，则回退到默认模型。
 */
const ensureActiveModelValid = (state: ModelStoreState) => {
  const active = findModelById(state, state.activeModelId)
  if (active) {
    return
  }
  state.activeModelId = DEFAULT_MODEL_ID
}

/**
 * 清洗模型名称：避免空字符串。
 */
const sanitizeModelName = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) {
    return `模型-${Date.now()}`
  }
  return trimmed
}

/**
 * 将名称转换为稳定 modelId：
 * - 先做 slug 化
 * - 再拼接时间后缀，降低冲突概率
 */
const toModelId = (name: string) => {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const tail = Date.now().toString(36)
  return `custom-${slug || 'model'}-${tail}`
}

/**
 * 初始化模型仓库。
 * 主要职责：
 * 1. 确保 .model 根目录存在
 * 2. 确保默认模型目录存在
 * 3. 确保状态文件存在
 * 4. 修复默认模型记录与 activeModelId 的一致性
 */
export const ensureModelStoreInitialized = async ({
  modelRootDir,
  defaultModelSourceDir,
  defaultModelEntry = DEFAULT_MODEL_ENTRY,
}: EnsureModelStoreOptions): Promise<ModelStoreState> => {
  await ensureDirectory(modelRootDir)
  await ensureDefaultModelExists(
    modelRootDir,
    defaultModelSourceDir,
    defaultModelEntry
  )

  const state = await ensureStoreState(modelRootDir)
  upsertDefaultModel(state, defaultModelEntry)
  ensureActiveModelValid(state)
  await writeStoreState(modelRootDir, state)
  return state
}

/**
 * 列出所有已登记模型（默认 + 自定义）。
 */
export const listStoredModels = async (
  modelRootDir: string
): Promise<StoredModelItem[]> => {
  const state = await readStoreState(modelRootDir)
  return state.models
}

/**
 * 获取当前激活模型；若状态异常则尝试回退到默认模型。
 */
export const getActiveModel = async (
  modelRootDir: string
): Promise<ActiveModelInfo> => {
  const state = await readStoreState(modelRootDir)
  const active = findModelById(state, state.activeModelId)
  if (active) {
    return toActiveModelInfo(active)
  }

  const fallback = findModelById(state, DEFAULT_MODEL_ID)
  if (!fallback) {
    throw new Error('No default model found in store state.')
  }

  state.activeModelId = DEFAULT_MODEL_ID
  await writeStoreState(modelRootDir, state)
  return toActiveModelInfo(fallback)
}

/**
 * 设置激活模型。
 * 仅修改状态文件，不涉及模型文件移动/复制。
 */
export const setActiveModel = async (
  modelRootDir: string,
  modelId: string
): Promise<ActiveModelInfo> => {
  const state = await readStoreState(modelRootDir)
  const nextModel = findModelById(state, modelId)

  if (!nextModel) {
    throw new Error(`Model not found: ${modelId}`)
  }

  state.activeModelId = nextModel.id
  await writeStoreState(modelRootDir, state)
  return toActiveModelInfo(nextModel)
}

/**
 * 将激活模型重置为默认模型。
 */
export const resetToDefaultModel = async (
  modelRootDir: string
): Promise<ActiveModelInfo> => {
  const state = await readStoreState(modelRootDir)
  const defaultModel = findModelById(state, DEFAULT_MODEL_ID)

  if (!defaultModel) {
    throw new Error('Default model not found.')
  }

  state.activeModelId = DEFAULT_MODEL_ID
  await writeStoreState(modelRootDir, state)
  return toActiveModelInfo(defaultModel)
}

/**
 * 删除自定义模型：
 * - 禁止删除默认模型
 * - 仅允许删除 source=custom 的模型
 * - 若删除的是当前激活模型，则自动切回默认模型
 * - 同时删除模型目录与状态记录
 */
export const deleteCustomModel = async (
  modelRootDir: string,
  modelId: string
): Promise<ActiveModelInfo> => {
  if (!modelId || modelId === DEFAULT_MODEL_ID) {
    throw new Error('Default model cannot be deleted.')
  }

  const state = await readStoreState(modelRootDir)
  const target = findModelById(state, modelId)

  if (!target) {
    throw new Error(`Model not found: ${modelId}`)
  }

  if (target.source !== 'custom') {
    throw new Error('Only custom models can be deleted.')
  }

  state.models = state.models.filter((item) => item.id !== modelId)

  if (state.activeModelId === modelId) {
    state.activeModelId = DEFAULT_MODEL_ID
  }

  const active = findModelById(state, state.activeModelId)
  if (!active) {
    throw new Error('No active model found after deletion.')
  }

  await writeStoreState(modelRootDir, state)
  await rm(modelFolderPath(modelRootDir, modelId), {
    recursive: true,
    force: true,
  })

  return toActiveModelInfo(active)
}

/**
 * 导入用户模型：
 * 1. 校验入口文件后缀
 * 2. 复制入口所在目录到 .model/custom-xxx
 * 3. 写入状态记录并激活该模型
 */
export const importModelFromFile = async ({
  modelRootDir,
  modelJsonPath,
  modelName,
}: ImportModelOptions): Promise<StoredModelItem> => {
  const normalizedJsonPath = resolve(modelJsonPath)
  const modelDir = dirname(normalizedJsonPath)
  const entryFile = basename(normalizedJsonPath)

  if (!entryFile.endsWith('.model3.json')) {
    throw new Error('Only .model3.json files are supported.')
  }

  const safeName = sanitizeModelName(
    modelName || entryFile.replace(/\.model3\.json$/i, '')
  )

  const modelId = toModelId(safeName)
  const targetDir = modelFolderPath(modelRootDir, modelId)

  await copyDirectory(modelDir, targetDir)

  const state = await readStoreState(modelRootDir)
  const now = Date.now()
  const nextItem: StoredModelItem = {
    id: modelId,
    name: safeName,
    entryFile: normalizeModelEntry(entryFile),
    source: 'custom',
    createdAt: now,
    updatedAt: now,
  }

  state.models.unshift(nextItem)
  state.activeModelId = nextItem.id
  await writeStoreState(modelRootDir, state)

  return nextItem
}

/**
 * 将协议请求 URL 解析为本地文件路径。
 * 安全点：通过 startsWith(scopedRoot) 限制访问范围，防止路径穿越。
 */
export const resolveModelFileFromProtocolRequest = (
  modelRootDir: string,
  requestUrl: string
): string | null => {
  const parsed = parseModelProtocolUrl(requestUrl)
  if (!parsed) {
    return null
  }

  const scopedRoot = resolve(modelFolderPath(modelRootDir, parsed.modelId))
  const resolvedFile = resolve(scopedRoot, parsed.relativePath)

  if (!resolvedFile.startsWith(scopedRoot)) {
    return null
  }

  return resolvedFile
}
