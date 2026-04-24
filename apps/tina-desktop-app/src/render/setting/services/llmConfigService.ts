import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const listLLMProviders = () => {
  return window.electronAPI.listLLMProviders()
}

export const getCurrentLLMProvider = () => {
  return window.electronAPI.getCurrentLLMProvider()
}

export const getLLMConfigForm = (providerKey: string) => {
  return window.electronAPI.getLLMConfigForm(
    providerKey
  ) as Promise<DynamicFormSchema>
}

export const getCurrentLLMConfig = (providerKey: string) => {
  return window.electronAPI.getCurrentLLMConfig(providerKey)
}

export const saveLLMConfig = (
  providerKey: string,
  values: DynamicFormValues
) => {
  return window.electronAPI.saveLLMConfig(providerKey, values)
}
