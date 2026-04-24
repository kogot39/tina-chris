import { Tool, type ToolSchema } from './base'

// ToolRegistry 是一个工具注册中心，负责管理 Agent 可用的工具实例，包括注册、注销、查询和执行工具等功能。
// AgentLoop 会持有一个 ToolRegistry 实例，并在每轮对话中根据 Agent 的需求查询和调用工具。
// 通过这种方式，工具的实现细节被封装在 ToolRegistry 内部，AgentLoop 和 Agent 只需要关心工具的接口和功能。
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
    return Array.from(this.tools.values()).map((tool) => tool.toSchema())
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
}
