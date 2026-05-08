import {
  BaseSTT,
  type STTErrorHandler,
  type STTTranscriptHandler,
} from '../base'
import WebSocket from 'ws'

import type { DynamicFormSchema } from '@tina-chris/tina-ui'
import type {
  QwenClientEvent,
  QwenInputAudioFormat,
  QwenLanguage,
  QwenServerMessage,
  QwenSessionConfig,
  QwenSessionFinishEvent,
} from './api-types'

// 可配置内容，放入 Config 中
export class QwenSTTConfig {
  apiKey: string = ''
  language: QwenLanguage = 'zh'
}

export function getQwenConfigForm(): DynamicFormSchema {
  return {
    key: 'stt-qwen',
    legend: 'Qwen STT 配置',
    saveText: '保存并应用',
    fields: [
      {
        name: 'apiKey',
        type: 'input',
        label: 'API Key',
        hint: 'DashScope 平台 API Key',
        required: true,
        valueType: 'string',
        rules: [
          {
            type: 'required',
            message: '请输入 Qwen STT API Key',
          },
        ],
        componentProps: {
          type: 'password',
          autocomplete: 'off',
          placeholder: 'sk-xxxx',
        },
      },
      {
        name: 'language',
        type: 'select',
        label: '识别语言',
        valueType: 'string',
        defaultValue: 'zh',
        componentProps: {
          options: [
            { label: '中文', value: 'zh' },
            { label: '粤语', value: 'yue' },
            { label: '英文', value: 'en' },
            { label: '日语', value: 'ja' },
            { label: '德语', value: 'de' },
            { label: '韩语', value: 'ko' },
            { label: '俄语', value: 'ru' },
            { label: '法语', value: 'fr' },
            { label: '葡萄牙语', value: 'pt' },
            { label: '阿拉伯语', value: 'ar' },
            { label: '意大利语', value: 'it' },
            { label: '西班牙语', value: 'es' },
            { label: '印地语', value: 'hi' },
            { label: '印尼语', value: 'id' },
            { label: '泰语', value: 'th' },
            { label: '土耳其语', value: 'tr' },
            { label: '乌克兰语', value: 'uk' },
            { label: '越南语', value: 'vi' },
            { label: '捷克语', value: 'cs' },
            { label: '丹麦语', value: 'da' },
            { label: '菲律宾语', value: 'fil' },
            { label: '芬兰语', value: 'fi' },
            { label: '冰岛语', value: 'is' },
            { label: '马来语', value: 'ms' },
            { label: '挪威语', value: 'no' },
            { label: '波兰语', value: 'pl' },
            { label: '瑞典语', value: 'sv' },
          ],
        },
      },
    ],
  }
}

export class QwenSTT extends BaseSTT {
  protected _connectionPromise: Promise<WebSocket> | null = null

  readonly isManualMode: boolean
  private transcriptHandler: STTTranscriptHandler = () => {}
  private errorHandler: STTErrorHandler = () => {}

  private apiKey: string
  private model: string
  private inputAudioFormat: QwenInputAudioFormat
  // 先配合前端输入音频的设置统一采样率
  private readonly sampleRate = 16000
  private language: QwenLanguage

  private _sessionFinishedPromise: Promise<void> | null = null
  private _sessionFinishedResolver: (() => void) | null = null

  // 懒连接：在第一次发送音频或接收事件时才建立 WebSocket 连接
  protected get _connection(): Promise<WebSocket> {
    if (this._connectionPromise) return this._connectionPromise

    if (!this.apiKey) {
      throw new Error('Qwen STT API key is required before connecting.')
    }

    this._sessionFinishedPromise = new Promise((resolve) => {
      this._sessionFinishedResolver = resolve
    })

    this._connectionPromise = new Promise((resolve, reject) => {
      const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(this.model)}`
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      })

      ws.on('open', () => {
        this.sendClientEvent(ws, {
          event_id: this.createEventId(),
          type: 'session.update',
          session: this.buildSessionConfig(),
        })
        resolve(ws)
      })

      ws.on('message', (rawData: WebSocket.RawData) => {
        try {
          const message = JSON.parse(rawData.toString()) as QwenServerMessage
          this.handleServerMessage(message)
        } catch (error) {
          this.emitError(error, '[QwenSTT] Failed to handle ws message.')
        }
      })

      ws.on('error', (error: unknown) => {
        this.emitError(error, '[QwenSTT] WebSocket error.')
        reject(error instanceof Error ? error : new Error(String(error)))
      })

      ws.on('close', () => {
        this._sessionFinishedResolver?.()
        this._sessionFinishedResolver = null
        this._sessionFinishedPromise = null
        this._connectionPromise = null
      })
    })

    return this._connectionPromise
  }

  constructor(config: QwenSTTConfig) {
    super()
    this.apiKey = config.apiKey
    this.model = 'qwen3-asr-flash-realtime'
    this.inputAudioFormat = 'pcm'
    this.language = config.language
    this.isManualMode = true
  }

  async connect(): Promise<void> {
    await this._connection
  }
  // 设置识别结果回调，由 STTManager 将结果转发到消息总线
  setTranscriptHandler(handler: STTTranscriptHandler): void {
    this.transcriptHandler = handler
  }
  // 设置错误回调，由 STTManager 统一处理并反馈
  setErrorHandler(handler: STTErrorHandler): void {
    this.errorHandler = handler
  }

  async handleAudio(audio: ArrayBuffer): Promise<void> {
    const conn = await this._connection
    const event: QwenClientEvent = {
      event_id: this.createEventId(),
      type: 'input_audio_buffer.append',
      audio: Buffer.from(audio).toString('base64'),
    }
    this.sendClientEvent(conn, event)
  }

  async close(): Promise<void> {
    if (!this._connectionPromise) return

    let ws: WebSocket
    try {
      ws = await this._connectionPromise
    } catch {
      this._connectionPromise = null
      this._sessionFinishedPromise = null
      this._sessionFinishedResolver = null
      return
    }

    const timeoutMs = 10_000

    if (ws.readyState === WebSocket.OPEN) {
      // Manual 模式由客户端明确控制语音边界：先 commit 当前音频缓冲区，
      // 让服务端创建本轮 input_audio item，再发送 session.finish 结束会话。
      // 如果直接断开或只 finish，最终 completed 转写可能来不及返回。
      this.sendClientEvent(ws, {
        event_id: this.createEventId(),
        type: 'input_audio_buffer.commit',
      })

      const finishEvent: QwenSessionFinishEvent = {
        event_id: this.createEventId(),
        type: 'session.finish',
      }
      this.sendClientEvent(ws, finishEvent)

      if (this._sessionFinishedPromise) {
        // 文档约定 completed 会先于 session.finished 返回；等到 finished 后再 close，
        // 可以保证 transcriptHandler('complete') 有机会先把最终文本交给 manager。
        await Promise.race([
          this._sessionFinishedPromise,
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

  private buildSessionConfig(): QwenSessionConfig {
    return {
      input_audio_format: this.inputAudioFormat,
      sample_rate: this.sampleRate,
      input_audio_transcription: {
        language: this.language,
      },
      // turn_detection 为 null 才会关闭服务端 VAD，启用 Qwen Manual 模式。
      // 录音按钮的松开动作就是语句边界，因此断句由客户端控制更稳定。
      turn_detection: null,
    }
  }

  private createEventId(): string {
    return `event_${crypto.randomUUID()}`
  }

  private sendClientEvent(ws: WebSocket, event: QwenClientEvent): void {
    ws.send(JSON.stringify(event))
  }

  private emitError(error: unknown, fallbackMessage: string): void {
    if (error instanceof Error) {
      this.errorHandler(error)
      return
    }
    this.errorHandler(new Error(`${fallbackMessage} ${String(error)}`.trim()))
  }

  private handleServerMessage(message: QwenServerMessage): void {
    switch (message.type) {
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = message.transcript.trim()
        if (transcript) {
          this.transcriptHandler(transcript, 'complete')
        }
        break
      }
      // 增加流式识别结果的处理，实时返回用户语音中的文本内容
      case 'conversation.item.input_audio_transcription.text': {
        const transcript = `${message.text}${message.stash}`.trim()
        if (transcript) {
          this.transcriptHandler(transcript, 'streaming')
        }
        break
      }
      case 'conversation.item.input_audio_transcription.failed': {
        this.errorHandler(
          new Error(
            `[QwenSTT] transcription failed: ${message.error.code} - ${message.error.message}`
          )
        )
        break
      }
      case 'error': {
        this.errorHandler(
          new Error(
            `[QwenSTT] server error: ${message.error.code} - ${message.error.message}`
          )
        )
        break
      }
      case 'session.finished': {
        this._sessionFinishedResolver?.()
        this._sessionFinishedResolver = null
        break
      }
      default:
        break
    }
  }
}
