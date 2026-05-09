/// <reference types="vite/client" />

import type { OutboundMessage } from '@tina-chris/tina-bus'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'
import type {
  ActiveModelInfo,
  AgentConfigData,
  AgentSaveResult,
  ChannelEnabledResult,
  ChannelProviderItem,
  ChannelSaveResult,
  ChannelStatus,
  GetSessionMessagesInput,
  LLMProviderItem,
  LLMSaveResult,
  STTEnabledResult,
  STTProviderItem,
  STTSaveResult,
  SessionMessagesPage,
  StoredModelItem,
  TTSEnabledResult,
  TTSProviderItem,
  TTSSaveResult,
  TTSVoiceCloneItem,
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
    abortAgentResponse: () => Promise<boolean>
    getSessionMessages: (
      input?: GetSessionMessagesInput
    ) => Promise<SessionMessagesPage>
    listChannelProviders: () => Promise<ChannelProviderItem[]>
    getChannelConfigForm: (providerKey: string) => Promise<DynamicFormSchema>
    getCurrentChannelConfig: (
      providerKey: string
    ) => Promise<Record<string, unknown> | null>
    saveChannelConfig: (
      providerKey: string,
      values: Record<string, unknown>
    ) => Promise<ChannelSaveResult>
    setChannelEnabled: (
      providerKey: string,
      enabled: boolean
    ) => Promise<ChannelEnabledResult>
    getChannelStatus: (providerKey: string) => Promise<ChannelStatus>
    startChannel: (providerKey?: string) => Promise<ChannelStatus[]>
    stopChannel: (providerKey?: string) => Promise<ChannelStatus[]>
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
    setSTTEnabled: (
      providerKey: string,
      enabled: boolean
    ) => Promise<STTEnabledResult>
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
    setTTSEnabled: (
      providerKey: string,
      enabled: boolean
    ) => Promise<TTSEnabledResult>
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
    getAgentConfig: () => Promise<AgentConfigData>
    saveAgentConfig: (values: AgentConfigData) => Promise<AgentSaveResult>
  }

  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
