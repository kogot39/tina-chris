import type {
  AgentConfigData,
  AgentSaveResult,
} from '../../../shared/agentConfig'

// 将IPC名称移出Vue组件，以便未来对API进行本地化更改。
// 同一接口配置服务相关的函数，类似接口封装，方便未来进行维护和修改。
export const getAgentConfig = (): Promise<AgentConfigData> => {
  return window.electronAPI.getAgentConfig()
}

export const saveAgentConfig = (
  values: AgentConfigData
): Promise<AgentSaveResult> => {
  return window.electronAPI.saveAgentConfig(values)
}
