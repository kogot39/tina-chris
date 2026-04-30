export type ChannelProviderItem = {
  key: string
  title: string
  description: string
  enabled: boolean
  connected: boolean
}

export type ChannelStatus = {
  providerKey: string
  connected: boolean
  message: string
  updatedAt: string
}

export type ChannelSaveResult = {
  providerKey: string
  status: ChannelStatus
}

export type ChannelEnabledResult = {
  providerKey: string
  enabled: boolean
  status: ChannelStatus
}
