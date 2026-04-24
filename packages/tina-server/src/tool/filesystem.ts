import fs from 'fs'
import path from 'path'
import { Tool, type ToolParameters } from './base'
import { resolveWorkspaceChildPath } from './path'

// 文件系统相关工具定义，包括读取文件和列出目录两种工具
export class ReadFileTool extends Tool {
  constructor(private workspacePath: string) {
    super()
  }

  get name(): string {
    return 'read_file'
  }

  get description(): string {
    return 'Read a text file inside the configured agent workspace.'
  }

  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative file path to read.',
        },
      },
      required: ['path'],
    }
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const inputPath = typeof params.path === 'string' ? params.path : ''
    const resolved = resolveWorkspaceChildPath(this.workspacePath, inputPath)
    if (!resolved.ok) {
      return `Error: ${resolved.error}`
    }

    if (!fs.existsSync(resolved.path)) {
      return `Error: File not found: ${inputPath}`
    }

    if (!fs.statSync(resolved.path).isFile()) {
      return `Error: Not a file: ${inputPath}`
    }

    return fs.readFileSync(resolved.path, 'utf-8')
  }
}

export class ListDirTool extends Tool {
  constructor(private workspacePath: string) {
    super()
  }

  get name(): string {
    return 'list_dir'
  }

  get description(): string {
    return 'List files and directories inside the configured agent workspace.'
  }

  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative directory path to list.',
        },
      },
      required: ['path'],
    }
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const inputPath = typeof params.path === 'string' ? params.path : '.'
    const resolved = resolveWorkspaceChildPath(this.workspacePath, inputPath)
    if (!resolved.ok) {
      return `Error: ${resolved.error}`
    }

    if (!fs.existsSync(resolved.path)) {
      return `Error: Directory not found: ${inputPath}`
    }

    if (!fs.statSync(resolved.path).isDirectory()) {
      return `Error: Not a directory: ${inputPath}`
    }

    const items = fs.readdirSync(resolved.path, { withFileTypes: true })
    if (items.length === 0) {
      return `Directory is empty: ${inputPath}`
    }

    return items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => {
        const prefix = item.isDirectory() ? '[dir]' : '[file]'
        return `${prefix} ${path.join(inputPath, item.name)}`
      })
      .join('\n')
  }
}
