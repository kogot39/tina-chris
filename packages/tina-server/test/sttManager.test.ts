import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConnectionEndMessage,
  ConnectionStartMessage,
  InboundMessage,
  MessageBus,
} from '@tina-chris/tina-bus'
import { STTManager } from '../src/stt/manager'

import type { Config } from '../src/config'
import type { STTErrorHandler, STTTranscriptHandler } from '../src/stt/lib/base'

const qwenMock = vi.hoisted(() => {
  const instances: Array<{
    connect: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    handleAudio: ReturnType<typeof vi.fn>
    emitTranscript: (content: string, status: 'complete' | 'streaming') => void
  }> = []

  class MockQwenSTT {
    private transcriptHandler: STTTranscriptHandler = () => {}
    private errorHandler: STTErrorHandler = () => {}

    connect = vi.fn(async () => undefined)
    close = vi.fn(async () => undefined)
    handleAudio = vi.fn(async () => undefined)

    constructor() {
      instances.push(this)
    }

    setTranscriptHandler(handler: STTTranscriptHandler): void {
      this.transcriptHandler = handler
    }

    setErrorHandler(handler: STTErrorHandler): void {
      this.errorHandler = handler
    }

    emitTranscript(content: string, status: 'complete' | 'streaming'): void {
      this.transcriptHandler(content, status)
    }

    emitError(error: Error): void {
      this.errorHandler(error)
    }
  }

  class MockQwenSTTConfig {
    apiKey = ''
    language = 'zh'
  }

  return {
    instances,
    MockQwenSTT,
    MockQwenSTTConfig,
    getQwenConfigForm: vi.fn(() => ({
      key: 'stt-qwen',
      legend: 'Qwen STT 配置',
      saveText: '保存并应用',
      fields: [],
    })),
  }
})

vi.mock('../src/stt/lib/qwen/qwenSTT', () => ({
  QwenSTT: qwenMock.MockQwenSTT,
  QwenSTTConfig: qwenMock.MockQwenSTTConfig,
  getQwenConfigForm: qwenMock.getQwenConfigForm,
}))

type ManagerInternals = {
  handleConnectionStart(message: InboundMessage): Promise<void>
  handleConnectionEnd(message: InboundMessage): Promise<void>
}

const createConfig = (): Config =>
  ({
    stt: { current: 'qwen' },
    getConfig: vi.fn(() => ({
      apiKey: 'test-key',
      language: 'zh',
    })),
  }) as unknown as Config

const createStartMessage = () =>
  new ConnectionStartMessage({
    channel: 'desktop',
    chatId: 'default',
    senderId: 'user',
    sendTo: 'stt-manager',
  })

const createEndMessage = () =>
  new ConnectionEndMessage({
    channel: 'desktop',
    chatId: 'default',
    senderId: 'user',
    sendTo: 'stt-manager',
  })

const createManager = async () => {
  const bus = new MessageBus()
  const outboundSpy = vi.spyOn(bus, 'publishOutbound')
  const inboundSpy = vi.spyOn(bus, 'publishInbound')
  const manager = new STTManager(createConfig(), bus)
  await (manager as unknown as ManagerInternals).handleConnectionStart(
    createStartMessage()
  )
  const instance = qwenMock.instances[0]

  outboundSpy.mockClear()
  inboundSpy.mockClear()

  return { manager, bus, outboundSpy, inboundSpy, instance }
}

describe('STTManager', () => {
  beforeEach(() => {
    qwenMock.instances.length = 0
  })

  it('publishes streaming preview only to desktop display', async () => {
    const { outboundSpy, inboundSpy, instance } = await createManager()

    instance.emitTranscript('正在识别', 'streaming')

    expect(outboundSpy).toHaveBeenCalledTimes(1)
    expect(inboundSpy).not.toHaveBeenCalled()

    const outbound = outboundSpy.mock.calls[0][0]
    expect(outbound).toMatchObject({
      channel: 'desktop',
      chatId: 'default',
      senderId: 'stt-manager',
      type: 'text',
      content: '正在识别',
      metadata: {
        displayType: 'speech_text',
        displayStatus: 'streaming',
      },
    })
    expect(typeof outbound.metadata.id).toBe('string')
  })

  it('submits the first non-empty complete transcript to Agent once', async () => {
    const { outboundSpy, inboundSpy, instance } = await createManager()

    instance.emitTranscript('最终文本', 'complete')
    instance.emitTranscript('最终文本', 'complete')

    expect(outboundSpy).toHaveBeenCalledTimes(1)
    expect(inboundSpy).toHaveBeenCalledTimes(1)

    const outbound = outboundSpy.mock.calls[0][0]
    const inbound = inboundSpy.mock.calls[0][0]
    expect(outbound.metadata.displayType).toBe('speech_text')
    expect(outbound.metadata.displayStatus).toBe('complete')
    expect(inbound).toMatchObject({
      channel: 'desktop',
      chatId: 'default',
      senderId: 'stt-manager',
      type: 'text',
      content: '最终文本',
      sendTo: 'agent',
      metadata: {
        type: 'speech_text',
        displayMessageId: outbound.metadata.id,
      },
    })
    expect(inbound.timestamp).toBe(outbound.timestamp)
  })

  it('does not publish final transcript from connection end itself', async () => {
    const { manager, outboundSpy, inboundSpy, instance } = await createManager()

    await (manager as unknown as ManagerInternals).handleConnectionEnd(
      createEndMessage()
    )

    expect(instance.close).toHaveBeenCalledTimes(1)
    expect(outboundSpy).not.toHaveBeenCalled()
    expect(inboundSpy).not.toHaveBeenCalled()

    instance.emitTranscript('迟到文本', 'complete')
    expect(outboundSpy).not.toHaveBeenCalled()
    expect(inboundSpy).not.toHaveBeenCalled()
  })
})
