import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QwenSTT, QwenSTTConfig } from '../src/stt/lib/qwen/qwenSTT'

const wsMock = vi.hoisted(() => {
  const sockets: MockWebSocket[] = []
  type Handler = (...args: any[]) => void

  class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3

    readyState = MockWebSocket.CONNECTING
    sent: any[] = []
    handlers = new Map<string, Handler[]>()
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED
      this.emit('close')
    })

    constructor(
      public readonly url: string,
      public readonly options: Record<string, unknown>
    ) {
      sockets.push(this)
    }

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
      return this
    }

    send(payload: string): void {
      this.sent.push(JSON.parse(payload))
    }

    open(): void {
      this.readyState = MockWebSocket.OPEN
      this.emit('open')
    }

    emitMessage(message: unknown): void {
      this.emit('message', {
        toString: () => JSON.stringify(message),
      })
    }

    private emit(event: string, ...args: any[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args)
      }
    }
  }

  return { sockets, MockWebSocket }
})

vi.mock('ws', () => ({
  default: wsMock.MockWebSocket,
}))

const createSTT = () => {
  const config = new QwenSTTConfig()
  config.apiKey = 'test-key'
  config.language = 'zh'
  return new QwenSTT(config)
}

describe('QwenSTT', () => {
  beforeEach(() => {
    wsMock.sockets.length = 0
  })

  it('opens Qwen realtime session in manual mode', async () => {
    const stt = createSTT()
    const connectPromise = stt.connect()
    const socket = wsMock.sockets[0]

    socket.open()
    await connectPromise

    expect(socket.sent[0]).toMatchObject({
      type: 'session.update',
      session: {
        input_audio_format: 'pcm',
        sample_rate: 16000,
        input_audio_transcription: {
          language: 'zh',
        },
        turn_detection: null,
      },
    })
  })

  it('commits audio before finishing and closes after session.finished', async () => {
    const stt = createSTT()
    const transcripts: Array<{
      content: string
      status: 'complete' | 'streaming'
    }> = []
    stt.setTranscriptHandler((content, status) => {
      transcripts.push({ content, status })
    })

    const connectPromise = stt.connect()
    const socket = wsMock.sockets[0]
    socket.open()
    await connectPromise

    await stt.handleAudio(new ArrayBuffer(2))
    const closePromise = stt.close()
    await Promise.resolve()

    expect(socket.sent.map((event) => event.type)).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
      'session.finish',
    ])
    expect(socket.close).not.toHaveBeenCalled()

    socket.emitMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      event_id: 'event_completed',
      item_id: 'item_1',
      content_index: 0,
      language: 'zh',
      emotion: 'neutral',
      transcript: '最终文本',
    })
    expect(transcripts).toEqual([
      {
        content: '最终文本',
        status: 'complete',
      },
    ])
    expect(socket.close).not.toHaveBeenCalled()

    socket.emitMessage({
      type: 'session.finished',
      event_id: 'event_finished',
    })
    await closePromise

    expect(socket.close).toHaveBeenCalledTimes(1)
  })
})
