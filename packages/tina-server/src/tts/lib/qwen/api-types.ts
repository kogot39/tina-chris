export type QwenTTSModel = 'qwen3-tts-vc-realtime-2026-01-15'

export type QwenTTSMode = 'server_commit' | 'commit'

export type QwenTTSLanguageType =
  | 'Auto'
  | 'Chinese'
  | 'English'
  | 'German'
  | 'Italian'
  | 'Portuguese'
  | 'Spanish'
  | 'Japanese'
  | 'Korean'
  | 'French'
  | 'Russian'

export type QwenTTSResponseFormat = 'pcm' | 'wav' | 'mp3' | 'opus'

export interface QwenTTSSessionConfig {
  voice: string
  mode?: QwenTTSMode
  language_type?: QwenTTSLanguageType
  response_format?: QwenTTSResponseFormat
  sample_rate?: 8000 | 16000 | 24000 | 48000
  speech_rate?: number
  volume?: number
  pitch_rate?: number
  bit_rate?: number
  // 仅qwen3-tts-instruct-flash-realtime支持
  instructions?: string
  // 仅qwen3-tts-instruct-flash-realtime支持，对instructions进行优化，默认为false
  optimize_instructions?: boolean
}

export interface QwenSessionUpdateEvent {
  event_id: string
  type: 'session.update'
  session: QwenTTSSessionConfig
}

export interface QwenInputTextBufferAppendEvent {
  event_id: string
  type: 'input_text_buffer.append'
  text: string
}

export interface QwenInputTextBufferCommitEvent {
  event_id: string
  type: 'input_text_buffer.commit'
}

export interface QwenInputTextBufferClearEvent {
  event_id: string
  type: 'input_text_buffer.clear'
}

export interface QwenSessionFinishEvent {
  event_id: string
  type: 'session.finish'
}

export type QwenTTSClientEvent =
  | QwenSessionUpdateEvent
  | QwenInputTextBufferAppendEvent
  | QwenInputTextBufferCommitEvent
  | QwenInputTextBufferClearEvent
  | QwenSessionFinishEvent

export interface QwenTTSErrorMessage {
  type: 'error'
  event_id: string
  error: {
    code: string
    message: string
  }
}

export interface QwenTTSSessionCreatedMessage {
  type: 'session.created'
  event_id: string
  session: {
    id: string
    object: string
    mode: QwenTTSMode
    model: string
    voice: string
    response_format: QwenTTSResponseFormat
    sample_rate: number
  }
}

export interface QwenTTSSessionUpdatedMessage {
  type: 'session.updated'
  event_id: string
  session: QwenTTSSessionCreatedMessage['session'] & {
    language_type?: QwenTTSLanguageType
  }
}

export interface QwenTTSInputTextBufferCommittedMessage {
  type: 'input_text_buffer.committed'
  event_id: string
  item_id: string
}

export interface QwenTTSInputTextBufferClearedMessage {
  type: 'input_text_buffer.cleared'
  event_id: string
}

// TODO: 可能需要的response.created事件、response.output_item.added事件、response.content_part.added事件

// 增量生成新的audio数据
export interface QwenTTSResponseAudioDeltaMessage {
  type: 'response.audio.delta'
  event_id: string
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  delta: string
}

// TODO: 可能需要的response.content_part.done事件、response.output_item.done事件

export interface QwenTTSResponseAudioDoneMessage {
  type: 'response.audio.done'
  event_id: string
  response_id: string
  item_id: string
  output_index: number
  content_index: number
}

// TODO: 可能需要的response.done事件

export interface QwenTTSSessionFinishedMessage {
  type: 'session.finished'
  event_id: string
}

export type QwenTTSServerMessage =
  | QwenTTSErrorMessage
  | QwenTTSSessionCreatedMessage
  | QwenTTSSessionUpdatedMessage
  | QwenTTSInputTextBufferCommittedMessage
  | QwenTTSInputTextBufferClearedMessage
  | QwenTTSResponseAudioDeltaMessage
  | QwenTTSResponseAudioDoneMessage
  | QwenTTSSessionFinishedMessage
