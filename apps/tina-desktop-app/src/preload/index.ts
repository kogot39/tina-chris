import { contextBridge, ipcRenderer } from 'electron'

import type { OutboundMessage } from '@tina-chris/tina-bus'
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

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口行为相关的 API
  setClickThrough: (enabled: boolean) =>
    ipcRenderer.invoke('window:set-click-through', enabled),
  setAlwaysOnTop: (enabled: boolean) =>
    ipcRenderer.invoke('window:set-always-on-top', enabled),
  // 窗口控制相关的 API
  openSettingWindow: () => ipcRenderer.invoke('window:open-setting'),
  closeSettingWindow: () => ipcRenderer.invoke('window:close-setting'),
  minimizeSettingWindow: () => ipcRenderer.invoke('window:minimize-setting'),
  // live2d 模型管理相关的 API
  listModels: () =>
    ipcRenderer.invoke('model:list') as Promise<StoredModelItem[]>,
  getActiveModel: () =>
    ipcRenderer.invoke('model:get-active') as Promise<ActiveModelInfo>,
  setActiveModel: (modelId: string) =>
    ipcRenderer.invoke('model:set-active', modelId) as Promise<ActiveModelInfo>,
  importModel: () =>
    ipcRenderer.invoke('model:import') as Promise<ActiveModelInfo | null>,
  deleteModel: (modelId: string) =>
    ipcRenderer.invoke('model:delete', modelId) as Promise<ActiveModelInfo>,
  resetDefaultModel: () =>
    ipcRenderer.invoke('model:reset-default') as Promise<ActiveModelInfo>,
  onActiveModelChanged: (callback: (model: ActiveModelInfo) => void) => {
    const listener = (_event: unknown, model: ActiveModelInfo) => {
      callback(model)
    }

    // 订阅模型变更事件
    ipcRenderer.on('model:active-changed', listener)
    return () => {
      ipcRenderer.off('model:active-changed', listener)
    }
  },
  // 设置关闭回调
  onSettingClosed: (callback: () => void) => {
    const listener = () => {
      callback()
    }

    ipcRenderer.on('window:setting-closed', listener)
    return () => {
      ipcRenderer.off('window:setting-closed', listener)
    }
  },
  // 总线相关的 API
  subscribeOutboundMessage: (callback: (message: OutboundMessage) => void) => {
    const listener = (_event: unknown, message: OutboundMessage) => {
      callback(message)
    }

    ipcRenderer.on('bus:outbound-message', listener)

    return () => {
      ipcRenderer.off('bus:outbound-message', listener)
    }
  },
  sendAudioInboundMessageStart: () =>
    ipcRenderer.invoke('bus:send-inbound-start'),
  sendAudioInboundMessage: (audio: ArrayBuffer) =>
    ipcRenderer.invoke('bus:send-inbound-audio', audio),
  sendAudioInboundMessageEnd: () => ipcRenderer.invoke('bus:send-inbound-end'),
  sendTextInboundMessage: (content: string) =>
    ipcRenderer.invoke('bus:send-inbound-text', content) as Promise<boolean>,
  abortAgentResponse: () =>
    ipcRenderer.invoke('bus:abort-agent-response') as Promise<boolean>,
  // Session 历史读取。渲染进程只拿展示消息结构，context 重建仍留在 server/session 内部。
  getSessionMessages: (input?: GetSessionMessagesInput) =>
    ipcRenderer.invoke(
      'session:get-messages',
      input
    ) as Promise<SessionMessagesPage>,
  // 聊天通道相关的 API
  listChannelProviders: () =>
    ipcRenderer.invoke('channel:list-providers') as Promise<
      ChannelProviderItem[]
    >,
  getChannelConfigForm: (providerKey: string) =>
    ipcRenderer.invoke('channel:get-config-form', providerKey),
  getCurrentChannelConfig: (providerKey: string) =>
    ipcRenderer.invoke(
      'channel:get-current-config',
      providerKey
    ) as Promise<Record<string, unknown> | null>,
  saveChannelConfig: (providerKey: string, values: Record<string, unknown>) =>
    ipcRenderer.invoke(
      'channel:save-config',
      providerKey,
      values
    ) as Promise<ChannelSaveResult>,
  setChannelEnabled: (providerKey: string, enabled: boolean) =>
    ipcRenderer.invoke(
      'channel:set-enabled',
      providerKey,
      enabled
    ) as Promise<ChannelEnabledResult>,
  getChannelStatus: (providerKey: string) =>
    ipcRenderer.invoke(
      'channel:get-status',
      providerKey
    ) as Promise<ChannelStatus>,
  startChannel: (providerKey?: string) =>
    ipcRenderer.invoke('channel:start', providerKey) as Promise<
      ChannelStatus[]
    >,
  stopChannel: (providerKey?: string) =>
    ipcRenderer.invoke('channel:stop', providerKey) as Promise<ChannelStatus[]>,
  // 语音识别相关的 API
  listSTTProviders: () =>
    ipcRenderer.invoke('stt:list-providers') as Promise<STTProviderItem[]>,
  getCurrentSTTProvider: () =>
    ipcRenderer.invoke('stt:get-current-provider') as Promise<string>,
  getSTTConfigForm: (providerKey: string) =>
    ipcRenderer.invoke('stt:get-config-form', providerKey),
  getCurrentSTTConfig: (providerKey: string) =>
    ipcRenderer.invoke('stt:get-current-config', providerKey) as Promise<Record<
      string,
      unknown
    > | null>,
  saveSTTConfig: (providerKey: string, values: Record<string, unknown>) =>
    ipcRenderer.invoke(
      'stt:save-config',
      providerKey,
      values
    ) as Promise<STTSaveResult>,
  setSTTEnabled: (providerKey: string, enabled: boolean) =>
    ipcRenderer.invoke(
      'stt:set-enabled',
      providerKey,
      enabled
    ) as Promise<STTEnabledResult>,
  // TTS 相关的 API
  listTTSProviders: () =>
    ipcRenderer.invoke('tts:list-providers') as Promise<TTSProviderItem[]>,
  getCurrentTTSProvider: () =>
    ipcRenderer.invoke('tts:get-current-provider') as Promise<string>,
  getTTSConfigForm: (providerKey: string) =>
    ipcRenderer.invoke('tts:get-config-form', providerKey),
  getCurrentTTSConfig: (providerKey: string) =>
    ipcRenderer.invoke('tts:get-current-config', providerKey) as Promise<Record<
      string,
      unknown
    > | null>,
  saveTTSConfig: (providerKey: string, values: Record<string, unknown>) =>
    ipcRenderer.invoke(
      'tts:save-config',
      providerKey,
      values
    ) as Promise<TTSSaveResult>,
  setTTSEnabled: (providerKey: string, enabled: boolean) =>
    ipcRenderer.invoke(
      'tts:set-enabled',
      providerKey,
      enabled
    ) as Promise<TTSEnabledResult>,
  getTTSVoiceCloneForm: (providerKey: string) =>
    ipcRenderer.invoke('tts:get-voice-clone-form', providerKey),
  createTTSVoiceClone: (providerKey: string, values: Record<string, unknown>) =>
    ipcRenderer.invoke(
      'tts:create-voice-clone',
      providerKey,
      values
    ) as Promise<Record<string, unknown>>,
  listTTSVoiceClones: (providerKey: string) =>
    ipcRenderer.invoke('tts:list-voice-clones', providerKey) as Promise<
      TTSVoiceCloneItem[]
    >,
  deleteTTSVoiceClone: (providerKey: string, voice: string) =>
    ipcRenderer.invoke(
      'tts:delete-voice-clone',
      providerKey,
      voice
    ) as Promise<boolean>,
  // LLM 相关的 API
  listLLMProviders: () =>
    ipcRenderer.invoke('llm:list-providers') as Promise<LLMProviderItem[]>,
  getCurrentLLMProvider: () =>
    ipcRenderer.invoke('llm:get-current-provider') as Promise<string>,
  getLLMConfigForm: (providerKey: string) =>
    ipcRenderer.invoke('llm:get-config-form', providerKey),
  getCurrentLLMConfig: (providerKey: string) =>
    ipcRenderer.invoke('llm:get-current-config', providerKey) as Promise<Record<
      string,
      unknown
    > | null>,
  saveLLMConfig: (providerKey: string, values: Record<string, unknown>) =>
    ipcRenderer.invoke(
      'llm:save-config',
      providerKey,
      values
    ) as Promise<LLMSaveResult>,
  // Agent 相关的 API
  getAgentConfig: () =>
    ipcRenderer.invoke('agent:get-config') as Promise<AgentConfigData>,
  saveAgentConfig: (values: AgentConfigData) =>
    ipcRenderer.invoke('agent:save-config', values) as Promise<AgentSaveResult>,
})
