export type QwenASRModel = 'qwen3-asr-flash-realtime' | 'qwen3-asr-realtime'

export type QwenInputAudioFormat = 'pcm' | 'opus'

export type QwenLanguage =
  | 'zh'
  | 'yue'
  | 'en'
  | 'ja'
  | 'de'
  | 'ko'
  | 'ru'
  | 'fr'
  | 'pt'
  | 'ar'
  | 'it'
  | 'es'
  | 'hi'
  | 'id'
  | 'th'
  | 'tr'
  | 'uk'
  | 'vi'
  | 'cs'
  | 'da'
  | 'fil'
  | 'fi'
  | 'is'
  | 'ms'
  | 'no'
  | 'pl'
  | 'sv'

export interface QwenTurnDetection {
  type: 'server_vad'
  threshold?: number
  silence_duration_ms?: number
}

export interface QwenSessionConfig {
  input_audio_format?: QwenInputAudioFormat
  sample_rate?: 8000 | 16000
  input_audio_transcription?: {
    language?: QwenLanguage
  }
  turn_detection?: QwenTurnDetection | null
}
// 建议在WebSocket连接建立成功后，立即发送此事件作为交互的第一步
export interface QwenSessionUpdateEvent {
  event_id: string
  type: 'session.update'
  session: QwenSessionConfig
}

export interface QwenInputAudioBufferAppendEvent {
  event_id: string
  type: 'input_audio_buffer.append'
  audio: string
}

// 非 VAD 模式手动提交音频缓冲区完成识别
export interface QwenInputAudioBufferCommitEvent {
  event_id: string
  type: 'input_audio_buffer.commit'
}

export interface QwenSessionFinishEvent {
  event_id: string
  type: 'session.finish'
}

export type QwenClientEvent =
  | QwenSessionUpdateEvent
  | QwenInputAudioBufferAppendEvent
  | QwenInputAudioBufferCommitEvent
  | QwenSessionFinishEvent

export interface QwenErrorMessage {
  type: 'error'
  event_id: string
  error: {
    type: string
    code: string
    message: string
    param?: string
    event_id?: string
  }
}
// 成功连接时的第一个事件
export interface QwenSessionCreatedMessage {
  type: 'session.created'
  event_id: string
  session: {
    id: string
    object: 'realtime.session'
    model: string
    modalities: string[]
    input_audio_format: string
    input_audio_transcription: {
      language?: QwenLanguage
    } | null
    turn_detection: QwenTurnDetection | null
  }
}
// 响应会话配置更新
export interface QwenSessionUpdatedMessage {
  type: 'session.updated'
  event_id: string
  session: QwenSessionCreatedMessage['session']
}
// 仅在 VAD 模式下发送，当服务端在音频缓冲区中检测到语音就发回
export interface QwenInputAudioSpeechStartedMessage {
  type: 'input_audio_buffer.speech_started'
  event_id: string
  audio_start_ms: number
  item_id: string
}
// 此事件仅在 VAD 模式下发送，当服务端在音频缓冲区中检测到语音结束时发送
export interface QwenInputAudioSpeechStoppedMessage {
  type: 'input_audio_buffer.speech_stopped'
  event_id: string
  audio_end_ms: number
  item_id: string
}
// VAD模式：当客户端完成音频数据发送（通过input_audio_buffer.append事件）后，服务端发送该事件。
// 非VAD模式：客户端完成音频数据发送（通过input_audio_buffer.append事件）并发送input_audio_buffer.commit事件后，服务端发送该事件。
export interface QwenInputAudioCommittedMessage {
  type: 'input_audio_buffer.committed'
  event_id: string
  previous_item_id?: string
  item_id: string
}
// 表明对话项被创建
export interface QwenConversationItemCreatedMessage {
  type: 'conversation.item.created'
  event_id: string
  previous_item_id?: string
  item: {
    id: string
    object: 'realtime.item'
    type: 'message'
    status: string
    role: 'user' | 'assistant' | 'system'
    content: Array<{
      type: string
      transcript: string | null
    }>
  }
}
// text是增量转录结果，stash是尚未转录的音频对应的文本预览
export interface QwenConversationInputAudioTextMessage {
  type: 'conversation.item.input_audio_transcription.text'
  event_id: string
  item_id: string
  content_index: number
  language: QwenLanguage
  emotion: string
  text: string
  stash: string
}
// 对话项结束时发送，transcript是最终转录结果
export interface QwenConversationInputAudioCompletedMessage {
  type: 'conversation.item.input_audio_transcription.completed'
  event_id: string
  item_id: string
  content_index: number
  language: QwenLanguage
  emotion: string
  transcript: string
}
// 当输入了音频但是识别失败时，服务端发送该事件
export interface QwenConversationInputAudioFailedMessage {
  type: 'conversation.item.input_audio_transcription.failed'
  item_id: string
  content_index: number
  error: {
    code: string
    message: string
    param?: string
  }
}
// 会话结束事件，表示当前会话中，所有音频识别已完成
export interface QwenSessionFinishedMessage {
  type: 'session.finished'
  event_id: string
}

export type QwenServerMessage =
  | QwenErrorMessage
  | QwenSessionCreatedMessage
  | QwenSessionUpdatedMessage
  | QwenInputAudioSpeechStartedMessage
  | QwenInputAudioSpeechStoppedMessage
  | QwenInputAudioCommittedMessage
  | QwenConversationItemCreatedMessage
  | QwenConversationInputAudioTextMessage
  | QwenConversationInputAudioCompletedMessage
  | QwenConversationInputAudioFailedMessage
  | QwenSessionFinishedMessage
