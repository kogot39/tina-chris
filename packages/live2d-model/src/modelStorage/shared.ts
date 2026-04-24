import type { ActiveModelInfo, ModelStoreState, StoredModelItem } from './types'

// 模型协议相关常量和工具函数
export const MODEL_PROTOCOL = 'tina-model'
export const MODEL_STORAGE_DIR = '.model'

// 默认模型相关常量
export const DEFAULT_MODEL_ID = 'default'
export const DEFAULT_MODEL_ENTRY = 'hiyori_free_t08.model3.json'
export const DEFAULT_MODEL_NAME = 'hiyori'

// 模型存储状态文件
export const MODEL_STATE_FILE = 'models.json'

const normalizeEntryFile = (entryFile: string) => {
  return entryFile.replace(/\\/g, '/').replace(/^\/+/, '')
}

// 构造模型协议 URL
export const toModelProtocolUrl = (
  modelId: string,
  entryFile: string
): string => {
  const normalizedEntry = normalizeEntryFile(entryFile)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  // 生成类似 tina-model://modelId/encoded/entry/file.json 的 URL
  return `${MODEL_PROTOCOL}://${encodeURIComponent(modelId)}/${normalizedEntry}`
}

// 解析模型协议 URL，提取模型 ID 和相对路径
export const parseModelProtocolUrl = (
  requestUrl: string
): { modelId: string; relativePath: string } | null => {
  try {
    const parsed = new URL(requestUrl)
    if (parsed.protocol !== `${MODEL_PROTOCOL}:`) {
      return null
    }

    const modelId = decodeURIComponent(parsed.hostname)
    const relativePath = parsed.pathname
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
      .join('/')

    if (!modelId || !relativePath) {
      return null
    }

    return {
      modelId,
      relativePath,
    }
  } catch {
    return null
  }
}

// 默认模型存储状态
export const createDefaultStoreState = (): ModelStoreState => {
  const now = Date.now()
  return {
    activeModelId: DEFAULT_MODEL_ID,
    models: [
      {
        id: DEFAULT_MODEL_ID,
        name: DEFAULT_MODEL_NAME,
        entryFile: DEFAULT_MODEL_ENTRY,
        source: 'builtin',
        createdAt: now,
        updatedAt: now,
      },
    ],
  }
}

export const findModelById = (
  state: ModelStoreState,
  id: string
): StoredModelItem | null => {
  return state.models.find((item) => item.id === id) || null
}

// 将存储的模型信息转换为前端使用的模型信息
export const toActiveModelInfo = (item: StoredModelItem): ActiveModelInfo => {
  return {
    id: item.id,
    name: item.name,
    source: item.source,
    url: toModelProtocolUrl(item.id, item.entryFile),
  }
}
