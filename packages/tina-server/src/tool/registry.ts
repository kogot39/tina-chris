import {
  type ToolCall,
  type ToolResultMessage,
  validateToolCall,
} from '@mariozechner/pi-ai'
import { Tool, type ToolSchema } from './base'

export type ToolExecutionResult = {
  toolCall: ToolCall
  resultText: string
  isError: boolean
  message: ToolResultMessage
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  getDefinitions(): ToolSchema[] {
    // ContextBuilder 会把这些定义直接放进 pi-ai Context.tools。
    // definitions 必须和 executeToolCall() 校验用的是同一批对象，避免模型看到的 schema
    // 与本地实际执行的 schema 不一致。
    return Array.from(this.tools.values()).map((tool) => tool.toSchema())
  }

  async executeToolCall(
    definitions: ToolSchema[],
    toolCall: ToolCall
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolCall.name)
    if (!tool) {
      return this.createResult(
        toolCall,
        `Error: Tool '${toolCall.name}' not found.`,
        true
      )
    }

    try {
      // 使用 pi-ai validateToolCall 对 TypeBox schema 做运行时校验。
      // 这一步放在工具执行前，是为了让“模型可见的工具契约”和“本地真正执行的参数”
      // 保持一致，也把不同 provider 对简单 JSON 值的解析差异收束到 pi-ai。
      const args = validateToolCall(definitions, toolCall)
      const resultText = await tool.execute(args)
      return this.createResult(
        toolCall,
        resultText,
        resultText.trim().startsWith('Error:')
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.createResult(
        toolCall,
        `Error executing ${toolCall.name}: ${message}`,
        true
      )
    }
  }

  async execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) {
      return `Error: Tool '${name}' not found.`
    }

    try {
      return await tool.execute(params)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error executing ${name}: ${message}`
    }
  }

  get names(): string[] {
    return Array.from(this.tools.keys())
  }

  private createResult(
    toolCall: ToolCall,
    resultText: string,
    isError: boolean
  ): ToolExecutionResult {
    return {
      toolCall,
      resultText,
      isError,
      // pi-ai 工具链要求工具执行结果以 role='toolResult' 写回 Context.messages。
      // 展示层会另外生成 tool 卡片；这里保留的是下一轮模型需要回放的精确上下文。
      message: {
        role: 'toolResult',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: 'text', text: resultText }],
        isError,
        timestamp: Date.now(),
      },
    }
  }
}
