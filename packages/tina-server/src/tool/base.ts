import { type Tool as PiTool, type TSchema, Type } from '@mariozechner/pi-ai'

export type ToolParameters = TSchema
export type ToolSchema = PiTool

export const EmptyParameters = Type.Object({})

// Tool 保留 Tina 原来的“顶层 Registry + 子工具类”结构，但公开 schema 已切成
// pi-ai Tool + TypeBox。这样工具定义可以交给 pi-ai 统一转换到不同供应商，
// Tina 不再维护 OpenAI function calling 专用 schema。
export abstract class Tool {
  abstract get name(): string
  abstract get description(): string
  abstract get parameters(): ToolParameters

  abstract execute(params: Record<string, unknown>): Promise<string>

  toSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    }
  }
}
