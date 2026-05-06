import { type AssistantMessage } from '@mariozechner/pi-ai'

// pi-ai assistant message 的 content 是多块结构，文本、thinking、toolCall 会混在一起。
// Tina 的桌面展示和 TTS 只消费普通 text 块，避免把 thinking 或工具 JSON 播报出去。
export const getAssistantText = (message: AssistantMessage): string => {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

// 工具调用同样从 assistant content 中抽取，loop 会把这些块写回 context，
// 再追加对应 toolResult message，形成 pi-ai 支持的多轮工具上下文。
export const getAssistantToolCalls = (message: AssistantMessage) => {
  return message.content.filter((block) => block.type === 'toolCall')
}
