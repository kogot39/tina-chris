import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const listSTTProviders = () => {
  return window.electronAPI.listSTTProviders()
}

export const getCurrentSTTProvider = () => {
  return window.electronAPI.getCurrentSTTProvider()
}

export const getSTTConfigForm = (providerKey: string) => {
  return window.electronAPI.getSTTConfigForm(
    providerKey
  ) as Promise<DynamicFormSchema>
}

export const getCurrentSTTConfig = (providerKey: string) => {
  return window.electronAPI.getCurrentSTTConfig(providerKey)
}

export const saveSTTConfig = (
  providerKey: string,
  values: DynamicFormValues
) => {
  return window.electronAPI.saveSTTConfig(providerKey, values)
}
