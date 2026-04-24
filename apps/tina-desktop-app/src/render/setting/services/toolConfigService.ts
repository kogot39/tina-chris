import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const listToolTypes = () => {
  return window.electronAPI.listToolTypes()
}

export const listToolProviders = (toolType: string) => {
  return window.electronAPI.listToolProviders(toolType)
}

export const getCurrentToolProvider = (toolType: string) => {
  return window.electronAPI.getCurrentToolProvider(toolType)
}

export const getToolConfigForm = (
  toolType: string,
  providerKey: string
): Promise<DynamicFormSchema> => {
  return window.electronAPI.getToolConfigForm(toolType, providerKey)
}

export const getCurrentToolConfig = (toolType: string, providerKey: string) => {
  return window.electronAPI.getCurrentToolConfig(toolType, providerKey)
}

export const saveToolConfig = (
  toolType: string,
  providerKey: string,
  values: DynamicFormValues
) => {
  return window.electronAPI.saveToolConfig(toolType, providerKey, values)
}
