export type StoredModelSource = 'builtin' | 'custom'

export type ActiveModelInfo = {
  id: string
  name: string
  source: StoredModelSource
  url: string
}

export type StoredModelItem = {
  id: string
  name: string
  entryFile: string
  source: StoredModelSource
  createdAt: number
  updatedAt: number
}
