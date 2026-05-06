import type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  ThinkingLevel,
} from '@mariozechner/pi-ai'

// pi 基础上增加一些额外类型声明

export type ReasoningEffort = 'off' | ThinkingLevel

// LLMManager 对外只暴露 stream/complete 两种生成入口。
// 这里的回调保持和 pi-ai 的 AssistantMessageEvent 一一对应，调用方可以选择只关心文本、
// thinking、工具调用或最终状态。onAborted 是对 pi-ai error(reason='aborted')
// 的语义化快捷回调，方便 loop/桌面端单独处理“用户主动停止”。
export type LLMEventCallbacks = {
  onEvent?: (event: AssistantMessageEvent) => void | Promise<void>
  onStart?: (
    event: Extract<AssistantMessageEvent, { type: 'start' }>
  ) => void | Promise<void>
  onTextStart?: (
    event: Extract<AssistantMessageEvent, { type: 'text_start' }>
  ) => void | Promise<void>
  onTextDelta?: (
    event: Extract<AssistantMessageEvent, { type: 'text_delta' }>
  ) => void | Promise<void>
  onTextEnd?: (
    event: Extract<AssistantMessageEvent, { type: 'text_end' }>
  ) => void | Promise<void>
  onThinkingStart?: (
    event: Extract<AssistantMessageEvent, { type: 'thinking_start' }>
  ) => void | Promise<void>
  onThinkingDelta?: (
    event: Extract<AssistantMessageEvent, { type: 'thinking_delta' }>
  ) => void | Promise<void>
  onThinkingEnd?: (
    event: Extract<AssistantMessageEvent, { type: 'thinking_end' }>
  ) => void | Promise<void>
  onToolCallStart?: (
    event: Extract<AssistantMessageEvent, { type: 'toolcall_start' }>
  ) => void | Promise<void>
  onToolCallDelta?: (
    event: Extract<AssistantMessageEvent, { type: 'toolcall_delta' }>
  ) => void | Promise<void>
  onToolCallEnd?: (
    event: Extract<AssistantMessageEvent, { type: 'toolcall_end' }>
  ) => void | Promise<void>
  onDone?: (
    event: Extract<AssistantMessageEvent, { type: 'done' }>
  ) => void | Promise<void>
  onError?: (
    event: Extract<AssistantMessageEvent, { type: 'error' }>
  ) => void | Promise<void>
  onAborted?: (
    event: Extract<AssistantMessageEvent, { type: 'error' }>
  ) => void | Promise<void>
}

export type LLMCallArguments = {
  context: Context
  // null 表示不把 maxTokens 传给 pi-ai/provider，由供应商使用自己的默认值。
  // undefined 表示调用方没有显式设置，语义上和 null 一样不传。
  maxTokens?: number | null
  temperature?: number
  // reasoningEffort 只是用户偏好，真正是否传入 reasoning 会在 buildOptions()
  // 里根据 pi-ai Model.reasoning 和 supported thinking levels 二次判断。
  reasoningEffort?: ReasoningEffort
  signal?: AbortSignal
  sessionId?: string
}

// LLMStreamArguments 继承 LLMCallArguments
// 并增加可选的 callbacks 字段，允许调用方在流式生成过程中接收事件回调。
export type LLMStreamArguments = LLMCallArguments & {
  callbacks?: LLMEventCallbacks
}

export const createEmptyUsage = (): AssistantMessage['usage'] => {
  const EMPTY_USAGE: AssistantMessage['usage'] = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  }
  return EMPTY_USAGE
}
