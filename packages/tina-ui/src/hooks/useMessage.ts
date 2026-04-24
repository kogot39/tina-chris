import { shallowRef } from 'vue'

import type { Message } from '../types'

export function useMessage() {
  const messages = shallowRef<Message[]>([])

  const addMessage = (message: Message) => {
    const current = messages.value
    const targetIndex = current.findIndex((item) => {
      return item.id === message.id
    })

    // 流式输出：同一 id 视为同一条消息，增量拼接内容。
    if (targetIndex >= 0) {
      const target = current[targetIndex]
      const nextMessage: Message = {
        ...target,
        ...message,
        content: `${target.content}${message.content}`,
      }

      const next = current.slice()
      next[targetIndex] = nextMessage
      messages.value = next
      return
    }

    messages.value = [...current, message]
  }

  return {
    messages,
    addMessage,
  }
}
