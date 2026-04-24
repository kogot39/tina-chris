/// <reference types="vite/client" />

import type { OutboundMessage } from '@tina-chris/tina-bus'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'
import type {
  ActiveModelInfo,
  AgentConfigData,
  AgentSaveResult,
  LLMProviderItem,
  LLMSaveResult,
  STTProviderItem,
  STTSaveResult,
  StoredModelItem,
  TTSProviderItem,
  TTSSaveResult,
  TTSVoiceCloneItem,
  ToolProviderItem,
  ToolSaveResult,
  ToolTypeItem,
} from '../shared'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}
declare global {
  interface ElectronAPI {
    setClickThrough: (enabled: boolean) => Promise<boolean>
    setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
    openSettingWindow: () => Promise<boolean>
    closeSettingWindow: () => Promise<boolean>
    minimizeSettingWindow: () => Promise<boolean>
    listModels: () => Promise<StoredModelItem[]>
    getActiveModel: () => Promise<ActiveModelInfo>
    setActiveModel: (modelId: string) => Promise<ActiveModelInfo>
    importModel: () => Promise<ActiveModelInfo | null>
    deleteModel: (modelId: string) => Promise<ActiveModelInfo>
    resetDefaultModel: () => Promise<ActiveModelInfo>
    onActiveModelChanged: (
      callback: (model: ActiveModelInfo) => void
    ) => () => void
    onSettingClosed: (callback: () => void) => () => void
    subscribeOutboundMessage: (
      callback: (message: OutboundMessage) => void
    ) => () => void
    sendAudioInboundMessageStart: () => void
    sendAudioInboundMessage: (audio: ArrayBuffer) => void
    sendAudioInboundMessageEnd: () => void
    sendTextInboundMessage: (content: string) => Promise<boolean>
    listSTTProviders: () => Promise<STTProviderItem[]>
    getCurrentSTTProvider: () => Promise<string>
    getSTTConfigForm: (providerKey: string) => Promise<DynamicFormSchema>
    getCurrentSTTConfig: (
      providerKey: string
    ) => Promise<Record<string, unknown> | null>
    saveSTTConfig: (
      providerKey: string,
      values: Record<string, unknown>
    ) => Promise<STTSaveResult>
    listTTSProviders: () => Promise<TTSProviderItem[]>
    getCurrentTTSProvider: () => Promise<string>
    getTTSConfigForm: (providerKey: string) => Promise<DynamicFormSchema>
    getCurrentTTSConfig: (
      providerKey: string
    ) => Promise<Record<string, unknown> | null>
    saveTTSConfig: (
      providerKey: string,
      values: Record<string, unknown>
    ) => Promise<TTSSaveResult>
    getTTSVoiceCloneForm: (providerKey: string) => Promise<DynamicFormSchema>
    createTTSVoiceClone: (
      providerKey: string,
      values: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    listTTSVoiceClones: (providerKey: string) => Promise<TTSVoiceCloneItem[]>
    deleteTTSVoiceClone: (
      providerKey: string,
      voice: string
    ) => Promise<boolean>
    listLLMProviders: () => Promise<LLMProviderItem[]>
    getCurrentLLMProvider: () => Promise<string>
    getLLMConfigForm: (providerKey: string) => Promise<DynamicFormSchema>
    getCurrentLLMConfig: (
      providerKey: string
    ) => Promise<Record<string, unknown> | null>
    saveLLMConfig: (
      providerKey: string,
      values: Record<string, unknown>
    ) => Promise<LLMSaveResult>
    listToolTypes: () => Promise<ToolTypeItem[]>
    listToolProviders: (toolType: string) => Promise<ToolProviderItem[]>
    getCurrentToolProvider: (toolType: string) => Promise<string>
    getToolConfigForm: (
      toolType: string,
      providerKey: string
    ) => Promise<DynamicFormSchema>
    getCurrentToolConfig: (
      toolType: string,
      providerKey: string
    ) => Promise<Record<string, unknown> | null>
    saveToolConfig: (
      toolType: string,
      providerKey: string,
      values: Record<string, unknown>
    ) => Promise<ToolSaveResult>
    getAgentConfig: () => Promise<AgentConfigData>
    saveAgentConfig: (values: AgentConfigData) => Promise<AgentSaveResult>
  }

  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
