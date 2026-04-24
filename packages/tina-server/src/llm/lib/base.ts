export class ToolCallRequest {
  constructor(
    // tool call id 由 provider 返回，后续 AgentLoop 需要原样带回 tool_result。
    public id: string,
    public name: string,
    public args: Record<string, any>
  ) {}
}

// 结构化的 LLM 回复内容，包含文本回复和工具调用信息，供 AgentLoop 解析和使用。
export class LLMResponse {
  constructor(
    public content: string,
    public toolCalls: ToolCallRequest[] = [],
    public finishReason: string = 'stop',
    public usage: Record<string, number> = {}
  ) {}

  hasToolCalls(): boolean {
    return this.toolCalls.length > 0
  }
}

export type LLMStreamChunk = {
  // 同一轮流式输出的稳定 id，前端可用它合并增量内容。
  id: string
  // 当前 chunk 的文本增量；上层自行决定是立即展示还是先缓冲。
  delta: string
}

export type LLMStreamChunkHandler = (
  chunk: LLMStreamChunk
) => void | Promise<void>

export interface ChatArguments {
  // AgentLoop 组装好的完整消息上下文，LLM 层不参与 history/session 的拼装。
  messages: Array<Record<string, any>>
  tools?: Array<Record<string, any>>
  model?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
  // 流式输出时由上层传入稳定 id，便于前端将同一条回复增量合并。
  streamId?: string
  // 流式回调仅负责把文本增量抛给上层，消息发布与展示由 AgentLoop/前端决定。
  onChunk?: LLMStreamChunkHandler
}

// LLM 抽象类，定义了聊天接口和获取默认模型的方法，
// 不同的 LLM 实现需要继承这个类并实现这些方法，以便 AgentLoop 可以统一调用。
export abstract class BaseLLM {
  abstract chat({
    messages,
    tools,
    model,
    maxTokens,
    temperature,
    stream,
    streamId,
    onChunk,
  }: ChatArguments): Promise<LLMResponse>

  abstract getDefaultModel(): string
}
