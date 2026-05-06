import { readString } from '@tina-chris/tina-util'
import { StringEnum, Type } from '@mariozechner/pi-ai'

import type { MemoryStore, MemoryUpdateOperation } from '@/memory'

import { Tool, type ToolParameters } from '@/tool/base'

// memory 工具只做参数解析和用户可读错误返回，真正的文件路径和安全限制都交给 MemoryStore。

const readMemoryPath = (params: Record<string, unknown>): string[] => {
  if (!('path' in params)) {
    return []
  }

  const value = params.path
  if (!Array.isArray(value)) {
    throw new TypeError('path must be an array of strings.')
  }

  if (!value.every((item) => typeof item === 'string')) {
    throw new Error('path must contain only strings.')
  }

  return value
}

const readMemoryOperation = (
  params: Record<string, unknown>
): MemoryUpdateOperation => {
  const operation = readString(params, 'operation')
  if (
    operation !== 'set' &&
    operation !== 'append' &&
    operation !== 'delete' &&
    operation !== 'rename'
  ) {
    throw new Error(
      "operation must be one of 'set', 'append', 'delete', or 'rename'."
    )
  }

  return operation
}

export class ReadMemoryTool extends Tool {
  constructor(private memoryStore: MemoryStore) {
    super()
  }

  get name(): string {
    return 'read_memory'
  }

  get description(): string {
    return [
      'Read long-term memory by Markdown directory path.',
      'Call without path to inspect the memory directory before reading a specific node.',
    ].join(' ')
  }

  get parameters(): ToolParameters {
    return Type.Object({
      path: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Optional memory path from the MEMORY.md directory, for example ["Projects", "Tina"]. Omit to read the directory.',
        })
      ),
      recursive: Type.Optional(
        Type.Boolean({
          description:
            'When true, return the selected node and all child nodes. Defaults to false.',
        })
      ),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    try {
      const path = readMemoryPath(params)
      const recursive = params.recursive === true
      return this.memoryStore.readLongTermMemory(path, recursive)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error: ${message}`
    }
  }
}

export class UpdateMemoryTool extends Tool {
  constructor(private memoryStore: MemoryStore) {
    super()
  }

  get name(): string {
    return 'update_memory'
  }

  get description(): string {
    return [
      'Update long-term memory by Markdown directory path.',
      'Use read_memory first when you need to inspect existing paths or old content.',
    ].join(' ')
  }

  get parameters(): ToolParameters {
    return Type.Object({
      operation: StringEnum(['set', 'append', 'delete', 'rename'] as const, {
        description:
          'set replaces a node body, append adds to a node body, delete removes a node subtree, rename changes the final path title.',
      }),
      path: Type.Array(Type.String(), {
        description:
          'Memory path from the MEMORY.md directory, for example ["Projects", "Tina"]. Missing paths are created for set and append.',
      }),
      content: Type.Optional(
        Type.String({ description: 'Required for set and append.' })
      ),
      title: Type.Optional(
        Type.String({
          description:
            'Required for rename. This becomes the final path title.',
        })
      ),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    try {
      const operation = readMemoryOperation(params)
      const path = readMemoryPath(params)

      this.memoryStore.updateLongTermMemory({
        operation,
        path,
        content: readString(params, 'content'),
        title: readString(params, 'title'),
      })

      return `Memory ${operation} completed for ${path.join(' / ')}.`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error: ${message}`
    }
  }
}
