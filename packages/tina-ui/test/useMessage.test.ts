import { describe, expect, it } from 'vitest'
import { useMessage } from '../src/hooks/useMessage'

describe('useMessage', () => {
  it('initializes and reloads multiple messages in order', () => {
    const initialMessages: Parameters<typeof useMessage>[0] = [
      {
        id: 'u1',
        type: 'user',
        content: 'hello',
        timestamp: 1,
      },
      {
        id: 'a1',
        type: 'assistant',
        content: 'hi',
        status: 'complete',
        timestamp: 2,
      },
    ]
    const { messages, initMessages } = useMessage(initialMessages)

    expect(messages.value.map((message) => message.id)).toEqual(['u1', 'a1'])
    expect(messages.value[0].status).toBe('complete')

    initMessages([
      {
        id: 'r1',
        type: 'reasoning',
        content: 'thinking',
        timestamp: 3,
      },
    ])

    expect(messages.value.map((message) => message.id)).toEqual(['r1'])
    expect(messages.value[0].status).toBe('complete')
  })

  it('appends streaming content by id for generated text message types', () => {
    const { messages, addAssistantMessage, addReasoningMessage } = useMessage()

    addAssistantMessage({
      id: 'assistant',
      content: 'hello ',
      status: 'streaming',
      timestamp: 1,
    })
    addAssistantMessage({
      id: 'assistant',
      content: 'world',
      status: 'streaming',
      timestamp: 2,
    })
    addAssistantMessage({
      id: 'assistant',
      content: 'END',
      timestamp: 9,
    })
    addReasoningMessage({ id: 'reasoning', content: 'step ', timestamp: 3 })
    addReasoningMessage({ id: 'reasoning', content: 'one', timestamp: 4 })

    expect(
      messages.value.find((item) => item.id === 'assistant')?.content
    ).toBe('hello world')
    expect(messages.value.find((item) => item.id === 'assistant')?.status).toBe(
      'complete'
    )
    expect(
      messages.value.find((item) => item.id === 'assistant')?.timestamp
    ).toBe(9)
    expect(
      messages.value.find((item) => item.id === 'reasoning')?.content
    ).toBe('step one')
  })

  it('replaces speech text preview content by id', () => {
    const { messages, addSpeechTextMessage } = useMessage()

    addSpeechTextMessage({
      id: 'speech-in',
      content: 'voice',
      status: 'streaming',
      timestamp: 5,
    })
    // STT streaming preview 是“当前完整识别文本”，不是增量 token；
    // 同一个 id 后续到达时要覆盖旧预览，避免重复拼接。
    addSpeechTextMessage({
      id: 'speech-in',
      content: 'voice input',
      status: 'complete',
      timestamp: 6,
    })

    expect(
      messages.value.find((item) => item.id === 'speech-in')?.content
    ).toBe('voice input')
    expect(messages.value.find((item) => item.id === 'speech-in')?.status).toBe(
      'complete'
    )
    expect(
      messages.value.find((item) => item.id === 'speech-in')?.timestamp
    ).toBe(6)
  })

  it('prepends historical messages without duplicating existing streaming ids', () => {
    const { messages, prependMessages, addAssistantMessage } = useMessage([
      {
        id: 'u2',
        type: 'user',
        content: 'newer',
        timestamp: 2,
      },
    ])

    addAssistantMessage({
      id: 'streaming',
      content: 'hello',
      status: 'streaming',
      timestamp: 3,
    })

    prependMessages([
      {
        id: 'u1',
        type: 'user',
        content: 'older',
        timestamp: 1,
      },
      {
        id: 'streaming',
        type: 'assistant',
        content: 'old duplicate',
        timestamp: 3,
      },
    ])

    expect(messages.value.map((message) => message.id)).toEqual([
      'u1',
      'u2',
      'streaming',
    ])
    expect(
      messages.value.find((message) => message.id === 'streaming')
    ).toMatchObject({
      content: 'hello',
      status: 'streaming',
    })
  })

  it('merges tool call and result messages by id', () => {
    const { messages, addToolCallMessage, addToolResultMessage } = useMessage()

    addToolCallMessage({
      id: 'tool-1',
      toolName: 'read_memory',
      parameters: { path: ['User'] },
      timestamp: 1,
    })
    addToolResultMessage({
      id: 'tool-1',
      result: 'memory body',
      timestamp: 2,
    })

    expect(messages.value).toHaveLength(1)
    const toolMessage = messages.value[0]
    expect(toolMessage.type).toBe('tool')
    if (toolMessage.type !== 'tool') {
      throw new Error('expected tool message')
    }
    expect(toolMessage.status).toBe('complete')
    expect(toolMessage.toolName).toBe('read_memory')
    expect(toolMessage.parameters).toEqual({ path: ['User'] })
    expect(toolMessage.result).toBe('memory body')
  })

  it('creates a tool result message even when the call was not seen', () => {
    const { messages, addToolResultMessage } = useMessage()

    addToolResultMessage({
      id: 'tool-missing',
      toolName: 'web_search',
      result: { ok: true },
      timestamp: 1,
    })

    expect(messages.value).toHaveLength(1)
    expect(messages.value[0]).toMatchObject({
      id: 'tool-missing',
      type: 'tool',
      toolName: 'web_search',
      status: 'complete',
      result: { ok: true },
    })
  })
})
