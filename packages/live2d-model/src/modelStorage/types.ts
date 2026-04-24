// 内建与自定义模型
export type StoredModelSource = 'builtin' | 'custom'

// 记录存储的模型信息
export type StoredModelItem = {
  id: string
  name: string
  entryFile: string
  source: StoredModelSource
  createdAt: number
  updatedAt: number
}

// 当前使用的模型和现有模型列表
export type ModelStoreState = {
  activeModelId: string
  models: StoredModelItem[]
}

// 当前使用的模型信息
export type ActiveModelInfo = {
  id: string
  name: string
  source: StoredModelSource
  url: string
}
