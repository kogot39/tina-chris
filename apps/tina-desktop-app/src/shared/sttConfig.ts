export type STTProviderItem = {
  key: string
  title: string
  description: string
  enabled: boolean
}

export type STTSaveResult = {
  current: string
}

export type STTEnabledResult = {
  providerKey: string
  current: string
  enabled: boolean
}
