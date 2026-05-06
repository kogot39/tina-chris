export type TextMessageStatus =
  | 'pending'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'aborted'

export type ToolMessageStatus = 'calling' | 'complete' | 'error' | 'aborted'

export type MessageType =
  | 'user'
  | 'assistant'
  | 'speech_text'
  | 'reasoning'
  | 'tool'

export type MessagePayload<
  TType extends MessageType,
  TStatus extends string,
> = {
  id: string
  type: TType
  content: string
  status: TStatus
  timestamp: number
}

export type UserMessage = MessagePayload<'user', TextMessageStatus>

export type AssistantMessage = MessagePayload<'assistant', TextMessageStatus>

export type SpeechTextMessage = MessagePayload<'speech_text', TextMessageStatus>

export type ReasoningMessage = MessagePayload<'reasoning', TextMessageStatus>

export type ToolCallMessage = MessagePayload<'tool', ToolMessageStatus> & {
  toolName: string
  parameters?: unknown
  result?: unknown
  error?: string
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SpeechTextMessage
  | ReasoningMessage
  | ToolCallMessage

export type TextMessage =
  | UserMessage
  | AssistantMessage
  | SpeechTextMessage
  | ReasoningMessage
