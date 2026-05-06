import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseMessage from '../src/components/messages/BaseMessage.vue'
import AgentMessage from '../src/components/messages/AgentMessage.vue'
import ReasoningContentMessage from '../src/components/messages/ReasoningContentMessage.vue'
import ToolMessage from '../src/components/messages/ToolMessage.vue'

import type { Message, ReasoningMessage, ToolCallMessage } from '../src/types'

const baseMessages: Message[] = [
  {
    id: 'u1',
    type: 'user',
    content: '用户输入',
    status: 'complete',
    timestamp: 1,
  },
  {
    id: 'a1',
    type: 'assistant',
    content: '最终回复',
    status: 'complete',
    timestamp: 2,
  },
  {
    id: 'stt1',
    type: 'speech_text',
    content: '识别文本',
    status: 'complete',
    timestamp: 3,
  },
  {
    id: 'r1',
    type: 'reasoning',
    content: '推理内容',
    status: 'complete',
    timestamp: 5,
  },
  {
    id: 't1',
    type: 'tool',
    toolName: 'read_memory',
    content: 'Calling read_memory',
    parameters: { path: ['User'] },
    result: '工具结果',
    status: 'complete',
    timestamp: 6,
  },
]

describe('message components', () => {
  it('BaseMessage dispatches all supported message types', () => {
    for (const message of baseMessages) {
      const wrapper = mount(BaseMessage, {
        props: { message },
      })

      expect(wrapper.text()).toContain(message.content)
    }
  })

  it('shows loading state for streaming assistant content', () => {
    const wrapper = mount(AgentMessage, {
      props: {
        message: {
          id: 'a-stream',
          type: 'assistant',
          content: 'streaming',
          status: 'streaming',
          timestamp: 1,
        },
      },
    })

    expect(wrapper.find('.loading-dots').exists()).toBe(true)
  })

  it('renders assistant markdown content while streaming', () => {
    const wrapper = mount(AgentMessage, {
      props: {
        message: {
          id: 'a-markdown',
          type: 'assistant',
          content: '**bold** and `code`',
          status: 'streaming',
          timestamp: 1,
        },
      },
    })

    expect(wrapper.find('strong').text()).toBe('bold')
    expect(wrapper.find('code').text()).toBe('code')
    expect(wrapper.find('.loading-dots').exists()).toBe(true)
  })

  it('keeps completed reasoning collapsed and streaming reasoning open', () => {
    const completed: ReasoningMessage = {
      id: 'r-complete',
      type: 'reasoning',
      content: 'done',
      status: 'complete',
      timestamp: 1,
    }
    const streaming: ReasoningMessage = {
      ...completed,
      id: 'r-stream',
      status: 'streaming',
    }

    expect(
      mount(ReasoningContentMessage, {
        props: { message: completed },
      })
        .find('details')
        .attributes('open')
    ).toBeUndefined()
    expect(
      mount(ReasoningContentMessage, {
        props: { message: streaming },
      })
        .find('details')
        .attributes('open')
    ).toBeDefined()
  })

  it('renders reasoning markdown content', () => {
    const wrapper = mount(ReasoningContentMessage, {
      props: {
        message: {
          id: 'r-markdown',
          type: 'reasoning',
          content: '- step one\n- step two',
          status: 'complete',
          timestamp: 1,
        },
      },
    })

    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'step one',
      'step two',
    ])
  })

  it('keeps completed tool results collapsed by default', () => {
    const message: ToolCallMessage = {
      id: 'tool',
      type: 'tool',
      toolName: 'read_memory',
      content: 'Calling read_memory',
      parameters: { path: ['User'] },
      result: 'hidden until expanded',
      status: 'complete',
      timestamp: 1,
    }
    const wrapper = mount(ToolMessage, {
      props: { message },
    })

    expect(wrapper.find('details').attributes('open')).toBeUndefined()
    expect(wrapper.text()).toContain('read_memory')
    expect(wrapper.text()).toContain('hidden until expanded')
  })
})
