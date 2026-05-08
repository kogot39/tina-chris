import { fileToBase64 } from '../utils'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const listTTSProviders = () => {
  return window.electronAPI.listTTSProviders()
}

export const getCurrentTTSProvider = () => {
  return window.electronAPI.getCurrentTTSProvider()
}

export const getTTSConfigForm = (
  providerKey: string
): Promise<DynamicFormSchema> => {
  return window.electronAPI.getTTSConfigForm(providerKey)
}

export const getCurrentTTSConfig = (providerKey: string) => {
  return window.electronAPI.getCurrentTTSConfig(providerKey)
}

export const saveTTSConfig = (
  providerKey: string,
  values: DynamicFormValues
) => {
  return window.electronAPI.saveTTSConfig(providerKey, values)
}

export const setTTSEnabled = (providerKey: string, enabled: boolean) => {
  return window.electronAPI.setTTSEnabled(providerKey, enabled)
}

export const getTTSVoiceCloneForm = (
  providerKey: string
): Promise<DynamicFormSchema> => {
  return window.electronAPI.getTTSVoiceCloneForm(providerKey)
}

export const createTTSVoiceClone = async (
  providerKey: string,
  values: DynamicFormValues
) => {
  const audioFile = values.audioFile
  if (!(audioFile instanceof File)) {
    throw new TypeError('请上传用于复刻的音频文件')
  }

  const audioData = await fileToBase64(audioFile, '读取音频文件失败')
  const payload = {
    ...values,
    audioFile: undefined,
    audioData,
  }

  return window.electronAPI.createTTSVoiceClone(providerKey, payload)
}

export const listTTSVoiceClones = (providerKey: string) => {
  return window.electronAPI.listTTSVoiceClones(providerKey)
}

export const deleteTTSVoiceClone = (providerKey: string, voice: string) => {
  return window.electronAPI.deleteTTSVoiceClone(providerKey, voice)
}
