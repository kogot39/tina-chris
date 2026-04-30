import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const listChannelProviders = () => {
  return window.electronAPI.listChannelProviders()
}

export const getChannelConfigForm = (
  providerKey: string
): Promise<DynamicFormSchema> => {
  return window.electronAPI.getChannelConfigForm(providerKey)
}

export const getCurrentChannelConfig = (providerKey: string) => {
  return window.electronAPI.getCurrentChannelConfig(providerKey)
}

export const saveChannelConfig = (
  providerKey: string,
  values: DynamicFormValues
) => {
  return window.electronAPI.saveChannelConfig(providerKey, values)
}

export const setChannelEnabled = (providerKey: string, enabled: boolean) => {
  return window.electronAPI.setChannelEnabled(providerKey, enabled)
}

export const getChannelStatus = (providerKey: string) => {
  return window.electronAPI.getChannelStatus(providerKey)
}

export const startChannel = (providerKey?: string) => {
  return window.electronAPI.startChannel(providerKey)
}

export const stopChannel = (providerKey?: string) => {
  return window.electronAPI.stopChannel(providerKey)
}
