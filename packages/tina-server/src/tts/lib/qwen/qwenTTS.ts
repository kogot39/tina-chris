import WebSocket from 'ws'
import { writableIterator } from '@tina-chris/tina-util'
import { BaseTTS, type TTSAudioChunkEvent, type TTSErrorHandler } from '../base'

import type { DynamicFormSchema } from '@tina-chris/tina-ui'

import type {
  QwenTTSClientEvent,
  QwenInputTextBufferCommitEvent,
  QwenTTSLanguageType,
  QwenTTSModel,
  QwenTTSServerMessage,
  QwenTTSSessionConfig,
  QwenSessionFinishEvent,
} from './api-types'

export const QWEN_TTS_MODELS: Array<{ label: string; value: QwenTTSModel }> = [
  {
    label: 'qwen3-tts-vc-realtime-2026-01-15',
    value: 'qwen3-tts-vc-realtime-2026-01-15',
  },
]

export class QwenTTSConfig {
  apiKey: string = ''
  model: QwenTTSModel = 'qwen3-tts-vc-realtime-2026-01-15'
  voice: string = 'Cherry'
  languageType: QwenTTSLanguageType = 'Chinese'
  speechRate: number = 1
  volume: number = 50
  pitchRate: number = 1
  bitRate: number = 128
}

export function getConfigForm(): DynamicFormSchema {
  return {
    key: 'tts-qwen',
    legend: 'Qwen TTS 配置',
    saveText: '保存并应用',
    fields: [
      {
        name: 'apiKey',
        type: 'input',
        label: 'API Key',
        hint: 'DashScope 平台 API Key，用于实时语音合成与音色复刻。',
        required: true,
        valueType: 'string',
        rules: [{ type: 'required', message: '请输入 Qwen TTS API Key' }],
        componentProps: {
          type: 'password',
          autocomplete: 'off',
          placeholder: 'sk-xxxx',
        },
      },
      {
        name: 'model',
        type: 'select',
        label: '模型',
        hint: '当前仅提供 VC Realtime 模型',
        valueType: 'string',
        defaultValue: 'qwen3-tts-vc-realtime-2026-01-15',
        componentProps: {
          options: QWEN_TTS_MODELS,
        },
      },
      {
        name: 'voice',
        type: 'input',
        label: '音色名',
        hint: '可填写内置音色或音色复刻返回的 voice 名称。',
        required: true,
        valueType: 'string',
        rules: [{ type: 'required', message: '请输入音色名' }],
        componentProps: {
          placeholder: 'Cherry',
        },
      },
      {
        name: 'languageType',
        type: 'select',
        label: '语言类型',
        valueType: 'string',
        defaultValue: 'Chinese',
        componentProps: {
          options: [
            { label: '自动', value: 'Auto' },
            { label: '中文', value: 'Chinese' },
            { label: '英文', value: 'English' },
            { label: '日语', value: 'Japanese' },
            { label: '韩语', value: 'Korean' },
            { label: '法语', value: 'French' },
            { label: '德语', value: 'German' },
            { label: '西班牙语', value: 'Spanish' },
            { label: '意大利语', value: 'Italian' },
            { label: '葡萄牙语', value: 'Portuguese' },
            { label: '俄语', value: 'Russian' },
          ],
        },
      },
      {
        name: 'speechRate',
        type: 'input',
        label: '语速',
        valueType: 'number',
        defaultValue: 1,
        componentProps: {
          type: 'number',
          min: 0.5,
          max: 2,
          step: 0.1,
        },
      },
      {
        name: 'volume',
        type: 'input',
        label: '音量',
        valueType: 'number',
        defaultValue: 50,
        componentProps: {
          type: 'number',
          min: 0,
          max: 100,
          step: 1,
        },
      },
      {
        name: 'pitchRate',
        type: 'input',
        label: '音调',
        valueType: 'number',
        defaultValue: 1,
        componentProps: {
          type: 'number',
          min: 0.5,
          max: 2,
          step: 0.1,
        },
      },
      {
        name: 'bitRate',
        type: 'input',
        label: '比特率',
        valueType: 'number',
        defaultValue: 128,
        componentProps: {
          type: 'number',
          min: 64,
          max: 320,
          step: 8,
        },
      },
    ],
  }
}

type CloseOptions = {
  graceful?: boolean
  timeoutMs?: number
}

export class QwenTTS extends BaseTTS {
  private bufferIterator = writableIterator<TTSAudioChunkEvent>()
  private connectionPromise: Promise<WebSocket> | null = null
  private sessionFinishedPromise: Promise<void> | null = null
  private sessionFinishedResolver: (() => void) | null = null
  private connectionResolver: ((ws: WebSocket) => void) | null = null
  private connectionRejecter: ((error: Error) => void) | null = null
  private socket: WebSocket | null = null
  private sessionReady = false
  private errorHandler: TTSErrorHandler = () => {}

  constructor(private config: QwenTTSConfig) {
    super()
  }

  async connect(): Promise<void> {
    await this.connection
  }

  async appendText(text: string): Promise<void> {
    if (!text || !text.trim()) {
      return
    }

    const conn = await this.connection
    this.sendClientEvent(conn, {
      event_id: this.createEventId(),
      type: 'input_text_buffer.append',
      text,
    })
  }

  async commit(): Promise<void> {
    if (!this.connectionPromise) {
      return
    }

    const conn = await this.connection
    const commitEvent: QwenInputTextBufferCommitEvent = {
      event_id: this.createEventId(),
      type: 'input_text_buffer.commit',
    }
    this.sendClientEvent(conn, commitEvent)
  }

  async *receiveEvents(): AsyncGenerator<TTSAudioChunkEvent> {
    for await (const event of this.bufferIterator) {
      yield event
    }
  }

  setErrorHandler(handler: TTSErrorHandler): void {
    this.errorHandler = handler
  }

  async close(options: CloseOptions = {}): Promise<void> {
    if (!this.connectionPromise) {
      return
    }

    let ws: WebSocket
    try {
      ws = await this.connectionPromise
    } catch {
      this.connectionPromise = null
      this.sessionFinishedPromise = null
      this.sessionFinishedResolver = null
      return
    }

    const graceful = options.graceful ?? true
    const timeoutMs = options.timeoutMs ?? 3000

    if (graceful && ws.readyState === WebSocket.OPEN) {
      const finishEvent: QwenSessionFinishEvent = {
        event_id: this.createEventId(),
        type: 'session.finish',
      }
      this.sendClientEvent(ws, finishEvent)

      if (this.sessionFinishedPromise) {
        await Promise.race([
          this.sessionFinishedPromise,
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ])
      }
    }

    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close()
    }
  }

  private get connection(): Promise<WebSocket> {
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    if (!this.config.apiKey) {
      throw new Error('Qwen TTS API key is required before connecting.')
    }
    if (!this.config.voice) {
      throw new Error('Qwen TTS voice is required before connecting.')
    }

    this.sessionFinishedPromise = new Promise((resolve) => {
      this.sessionFinishedResolver = resolve
    })
    this.sessionReady = false

    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolver = resolve
      this.connectionRejecter = reject
      const model = this.config.model || QWEN_TTS_MODELS[0].value
      const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(model)}`
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      })

      ws.on('open', () => {
        this.socket = ws
        this.sendClientEvent(ws, {
          event_id: this.createEventId(),
          type: 'session.update',
          session: this.buildSessionConfig(),
        })
      })

      ws.on('message', (rawData: WebSocket.RawData) => {
        try {
          const message = JSON.parse(rawData.toString()) as QwenTTSServerMessage
          this.handleServerMessage(message)
        } catch (error) {
          this.emitError(error, '[QwenTTS] Failed to handle websocket message.')
        }
      })

      ws.on('error', (error: unknown) => {
        const normalized =
          error instanceof Error ? error : new Error(String(error))

        if (this.connectionRejecter) {
          this.connectionRejecter(normalized)
          this.connectionResolver = null
          this.connectionRejecter = null
        } else {
          this.emitError(normalized, '[QwenTTS] WebSocket error.')
        }
      })

      ws.on('close', () => {
        this.sessionFinishedResolver?.()
        this.sessionFinishedResolver = null
        this.sessionFinishedPromise = null
        if (!this.sessionReady && this.connectionRejecter) {
          this.connectionRejecter(
            new Error('Qwen TTS connection closed before session.updated.')
          )
        }
        this.connectionResolver = null
        this.connectionRejecter = null
        this.socket = null
        this.sessionReady = false
        this.connectionPromise = null
        this.bufferIterator.cancel()
      })
    })

    return this.connectionPromise
  }

  private buildSessionConfig(): QwenTTSSessionConfig {
    return {
      voice: this.config.voice,
      mode: 'server_commit',
      language_type: this.config.languageType,
      response_format: 'pcm',
      sample_rate: 24000,
      speech_rate: this.config.speechRate,
      volume: this.config.volume,
      pitch_rate: this.config.pitchRate,
      bit_rate: this.config.bitRate,
    }
  }

  private createEventId(): string {
    return `event_${crypto.randomUUID()}`
  }

  private sendClientEvent(ws: WebSocket, event: QwenTTSClientEvent): void {
    ws.send(JSON.stringify(event))
  }

  private emitError(error: unknown, fallbackMessage: string): void {
    if (error instanceof Error) {
      this.errorHandler(error)
      return
    }

    this.errorHandler(new Error(`${fallbackMessage} ${String(error)}`.trim()))
  }

  private handleServerMessage(message: QwenTTSServerMessage): void {
    switch (message.type) {
      case 'session.updated': {
        this.sessionReady = true
        if (this.connectionResolver && this.socket) {
          this.connectionResolver(this.socket)
          this.connectionResolver = null
          this.connectionRejecter = null
        }
        break
      }
      case 'response.audio.delta': {
        this.bufferIterator.push({
          id: message.item_id,
          audio: message.delta,
          ts: Date.now(),
        })
        break
      }
      case 'error': {
        const error = new Error(
          `[QwenTTS] server error: ${message.error.code} - ${message.error.message}`
        )

        if (this.connectionRejecter && !this.sessionReady) {
          this.connectionRejecter(error)
          this.connectionResolver = null
          this.connectionRejecter = null
        } else {
          this.errorHandler(error)
        }
        break
      }
      case 'session.finished': {
        this.sessionFinishedResolver?.()
        this.sessionFinishedResolver = null
        break
      }
      default:
        break
    }
  }
}
