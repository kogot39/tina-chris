export type TTSProviderItem = {
  key: string
  title: string
  description: string
  enabled: boolean
}

export type TTSSaveResult = {
  current: string
}

export type TTSEnabledResult = {
  providerKey: string
  current: string
  enabled: boolean
}

export type TTSVoiceCloneItem = {
  voice: string
  gmt_create: string
  target_model: string
}

export type VoiceTableColumn = {
  key: string
  title: string
  width?: string
  align?: 'left' | 'center' | 'right'
}
