// Shared Agent configuration DTOs.
// These types are reused by preload, renderer services, and the settings page
// so we do not depend on ambient declarations for business-level data shapes.

export type AgentUserProfileData = {
  name: string
  timezone: string
  language: string
  communicationStyle: string
  responseLength: string
  technicalLevel: string
  primaryRole: string
  interestsAndHobbies: string
  personalHabits: string
  specialInstructions: string
}

export type AgentPromptData = {
  identity: string
  guidelines: string
  additionalInstructions: string
}

export type SoulPromptData = {
  identity: string
  personalityTraits: string
  coreValues: string
  communicationStyle: string
  additionalNotes: string
}

export type AgentReasoningEffort =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export type AgentConfigData = {
  workspace: string
  model: string
  maxTokens: number | null
  temperature: number
  reasoningEffort: AgentReasoningEffort
  maxToolInteractions: number
  userProfile: AgentUserProfileData
  agentPrompt: AgentPromptData
  soulPrompt: SoulPromptData
}

export type AgentSaveResult = {
  agent: AgentConfigData
  workspacePath: string
}

// Keep renderer defaults next to the DTO definition so the settings page and
// future consumers stay aligned with the server-side config schema.
export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_REASONING_EFFORT: AgentReasoningEffort = 'off'
export const DEFAULT_MAX_TOOL_INTERACTIONS = 20

export const createEmptyAgentUserProfile = (): AgentUserProfileData => ({
  name: '',
  timezone: '',
  language: '',
  communicationStyle: '',
  responseLength: '',
  technicalLevel: '',
  primaryRole: '',
  interestsAndHobbies: '',
  personalHabits: '',
  specialInstructions: '',
})

export const createEmptyAgentPrompt = (): AgentPromptData => ({
  identity: '',
  guidelines: '',
  additionalInstructions: '',
})

export const createEmptySoulPrompt = (): SoulPromptData => ({
  identity: '',
  personalityTraits: '',
  coreValues: '',
  communicationStyle: '',
  additionalNotes: '',
})

export const createDefaultAgentConfig = (): AgentConfigData => ({
  workspace: '',
  model: '',
  maxTokens: null,
  temperature: DEFAULT_TEMPERATURE,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
  maxToolInteractions: DEFAULT_MAX_TOOL_INTERACTIONS,
  userProfile: createEmptyAgentUserProfile(),
  agentPrompt: createEmptyAgentPrompt(),
  soulPrompt: createEmptySoulPrompt(),
})
