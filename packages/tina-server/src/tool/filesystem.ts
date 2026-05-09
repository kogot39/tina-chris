import fs from 'fs'
import path from 'path'
import { Type } from '@mariozechner/pi-ai'
import { Tool, type ToolParameters } from './base'
import { resolveWorkspaceChildPath } from './path'

// 文件系统相关工具定义，包括文件读写、编辑、删除和目录列表工具
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
    return Type.Object({
      path: Type.String({
        description: 'Workspace-relative file path to read.',
      }),
    })
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
    return Type.Object({
      path: Type.String({
        description: 'Workspace-relative directory path to list.',
      }),
    })
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

export class WriteFileTool extends Tool {
  constructor(private workspacePath: string) {
    super()
  }

  get name(): string {
    return 'write_file'
  }

  get description(): string {
    return 'Write content to a file inside the agent workspace. Creates parent directories as needed.'
  }

  get parameters(): ToolParameters {
    return Type.Object({
      path: Type.String({
        description: 'Workspace-relative file path to write.',
      }),
      content: Type.String({
        description: 'Text content to write to the file.',
      }),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const inputPath = typeof params.path === 'string' ? params.path : ''
    const content = typeof params.content === 'string' ? params.content : ''
    const resolved = resolveWorkspaceChildPath(this.workspacePath, inputPath)
    if (!resolved.ok) {
      return `Error: ${resolved.error}`
    }

    fs.mkdirSync(path.dirname(resolved.path), { recursive: true })
    fs.writeFileSync(resolved.path, content, 'utf-8')
    return `Wrote ${content.length} bytes to ${inputPath}.`
  }
}

export class EditFileTool extends Tool {
  constructor(private workspacePath: string) {
    super()
  }

  get name(): string {
    return 'edit_file'
  }

  get description(): string {
    return 'Replace a string in a file inside the agent workspace. Finds the first exact match of old_string and replaces it with new_string.'
  }

  get parameters(): ToolParameters {
    return Type.Object({
      path: Type.String({
        description: 'Workspace-relative file path to edit.',
      }),
      old_string: Type.String({
        description: 'Exact text to find and replace.',
      }),
      new_string: Type.String({
        description: 'Replacement text.',
      }),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const inputPath = typeof params.path === 'string' ? params.path : ''
    const oldString =
      typeof params.old_string === 'string' ? params.old_string : ''
    const newString =
      typeof params.new_string === 'string' ? params.new_string : ''
    const resolved = resolveWorkspaceChildPath(this.workspacePath, inputPath)
    if (!resolved.ok) {
      return `Error: ${resolved.error}`
    }

    if (!oldString) {
      return 'Error: old_string is required.'
    }

    if (!fs.existsSync(resolved.path) || !fs.statSync(resolved.path).isFile()) {
      return `Error: File not found: ${inputPath}`
    }

    const original = fs.readFileSync(resolved.path, 'utf-8')
    const index = original.indexOf(oldString)
    if (index === -1) {
      return `Error: old_string not found in ${inputPath}.`
    }

    if (original.includes(oldString, index + 1)) {
      return `Error: old_string appears more than once in ${inputPath}. Provide a larger string with more surrounding context to make it unique.`
    }

    const updated =
      original.slice(0, index) +
      newString +
      original.slice(index + oldString.length)
    fs.writeFileSync(resolved.path, updated, 'utf-8')
    return `Replaced 1 occurrence in ${inputPath}.`
  }
}

export class DeleteFileTool extends Tool {
  constructor(private workspacePath: string) {
    super()
  }

  get name(): string {
    return 'delete_file'
  }

  get description(): string {
    return 'Delete a file inside the agent workspace.'
  }

  get parameters(): ToolParameters {
    return Type.Object({
      path: Type.String({
        description: 'Workspace-relative file path to delete.',
      }),
    })
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

    fs.unlinkSync(resolved.path)
    return `Deleted ${inputPath}.`
  }
}
