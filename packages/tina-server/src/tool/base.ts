// 工具抽象类定义了工具的基本结构和行为，包括名称、描述、参数以及执行方法
// 每个具体的工具需要继承这个抽象类并实现这些属性和方法，以便在 AgentLoop 中被注册和调用。
export type ToolParameters = Record<string, unknown>

export type ToolSchema = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolParameters
  }
}

export abstract class Tool {
  abstract get name(): string
  abstract get description(): string
  abstract get parameters(): ToolParameters

  abstract execute(params: Record<string, unknown>): Promise<string>

  toSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    }
  }
}
