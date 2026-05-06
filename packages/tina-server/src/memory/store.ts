import fs from 'fs'
import path from 'path'
import { logger, safeFilename } from '@tina-chris/tina-util'

// MemoryStore 是 Agent 记忆模块的唯一文件读写入口。
// 所有长期记忆和会话摘要都固定在 workspace/memory 下，避免模型通过记忆工具触达任意文件。

const MEMORY_TITLE = '# Long-term Memory'
const DIRECTORY_TITLE = 'Directory'
const EMPTY_DIRECTORY = 'No long-term memory entries.'
const MAX_MEMORY_PATH_DEPTH = 5
const DAILY_MEMORY_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/

export type MemoryUpdateOperation = 'set' | 'append' | 'delete' | 'rename'

export type MemoryUpdateInput = {
  operation: MemoryUpdateOperation
  path: string[]
  content?: string
  title?: string
}

type MemoryNode = {
  title: string
  content: string
  children: MemoryNode[]
}

const createRootNode = (): MemoryNode => ({
  title: '',
  content: '',
  children: [],
})

// sessionKey 里通常包含 channel/chatId 等分隔符，不适合直接作为文件名。
// 这里沿用 session 模块的 safeFilename 策略，保证摘要文件名稳定且跨平台可写。
const safeSessionFilename = (sessionKey: string): string => {
  return safeFilename(sessionKey.replace(/:/g, '_'))
}

const isHeadingLine = (
  line: string
): { level: number; title: string } | null => {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
  if (!match) {
    return null
  }

  return {
    level: match[1].length,
    title: match[2].replace(/\s+#+$/, '').trim(),
  }
}

const normalizeLineEndings = (content: string): string => {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const slugifyHeading = (title: string): string => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return slug || 'memory'
}

export class MemoryStore {
  readonly memoryDir: string
  private readonly longTermFile: string
  private readonly sessionsDir: string

  constructor(workspacePath: string) {
    this.memoryDir = path.join(workspacePath, 'memory')
    this.longTermFile = path.join(this.memoryDir, 'MEMORY.md')
    this.sessionsDir = path.join(this.memoryDir, 'sessions')
    fs.mkdirSync(this.memoryDir, { recursive: true })
    fs.mkdirSync(this.sessionsDir, { recursive: true })
    this.cleanupDailyMemoryFiles()
    this.ensureLongTermFile()
  }

  readLongTermDirectory(): string {
    const root = this.parseLongTermMemory()
    return this.renderDirectory(root)
  }

  readLongTermMemory(pathSegments: string[] = [], recursive = false): string {
    const memoryPath = this.normalizeMemoryPath(pathSegments, {
      allowEmpty: true,
    })
    if (memoryPath.length === 0) {
      return this.readLongTermDirectory()
    }

    const root = this.parseLongTermMemory()
    const node = this.findRequiredNode(root, memoryPath)
    if (recursive) {
      return this.renderNode(node, 1)
    }

    const content = node.content.trim()
    return content || `No content at memory path: ${memoryPath.join(' / ')}.`
  }

  updateLongTermMemory(input: MemoryUpdateInput): void {
    const operation = input.operation
    const memoryPath = this.normalizeMemoryPath(input.path)
    const root = this.parseLongTermMemory()

    if (operation === 'set') {
      const node = this.ensureNode(root, memoryPath)
      node.content = this.normalizeContent(input.content)
      this.writeLongTermMemory(root)
      return
    }

    if (operation === 'append') {
      const node = this.ensureNode(root, memoryPath)
      const content = this.normalizeContent(input.content)
      node.content = [node.content.trim(), content]
        .filter((part) => part.length > 0)
        .join('\n\n')
      this.writeLongTermMemory(root)
      return
    }

    if (operation === 'delete') {
      this.deleteNode(root, memoryPath)
      this.writeLongTermMemory(root)
      return
    }

    if (operation === 'rename') {
      const nextTitle = this.normalizeTitle(input.title)
      const { parent, node } = this.findNodeWithParent(root, memoryPath)
      if (
        parent.children.some(
          (child) => child !== node && child.title === nextTitle
        )
      ) {
        throw new Error(
          `Memory path already exists: ${[
            ...memoryPath.slice(0, -1),
            nextTitle,
          ].join(' / ')}.`
        )
      }

      node.title = nextTitle
      this.writeLongTermMemory(root)
      return
    }

    const unsupported: never = operation
    throw new Error(`Unsupported memory operation: ${unsupported}.`)
  }

  readSessionSummary(sessionKey: string): string {
    return this.readFileIfExists(this.getSessionSummaryFile(sessionKey))
  }

  // 会话摘要由 AgentLoop 的摘要器自动维护，不通过普通工具直接写入。
  writeSessionSummary(sessionKey: string, content: string): void {
    const normalized = content.trim()
    const filePath = this.getSessionSummaryFile(sessionKey)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, normalized ? `${normalized}\n` : '', 'utf-8')
  }

  buildMemoryContext(sessionKey: string): string {
    const parts: string[] = [
      `## Long-term Memory Directory\n\n${this.readLongTermDirectory()}`,
    ]
    const sessionSummary = this.readSessionSummary(sessionKey).trim()

    if (sessionSummary) {
      parts.push(`## Current Session Summary\n\n${sessionSummary}`)
    }

    return `# Memory\n\n${parts.join('\n\n')}`
  }

  private ensureLongTermFile(): void {
    if (fs.existsSync(this.longTermFile)) {
      return
    }

    fs.writeFileSync(
      this.longTermFile,
      `${MEMORY_TITLE}\n\n## ${DIRECTORY_TITLE}\n\n${EMPTY_DIRECTORY}\n`,
      'utf-8'
    )
  }

  private parseLongTermMemory(): MemoryNode {
    this.ensureLongTermFile()

    const root = createRootNode()
    const stack: Array<{ level: number; node: MemoryNode }> = [
      { level: 1, node: root },
    ]
    const lines = normalizeLineEndings(
      fs.readFileSync(this.longTermFile, 'utf-8')
    ).split('\n')

    let currentNode: MemoryNode | null = null
    let currentContent: string[] = []
    let inDirectory = false

    const flushCurrentContent = () => {
      if (!currentNode) {
        currentContent = []
        return
      }

      currentNode.content = currentContent.join('\n').trim()
      currentContent = []
    }

    for (const line of lines) {
      const heading = isHeadingLine(line)
      if (!heading) {
        if (!inDirectory && currentNode) {
          currentContent.push(line)
        }
        continue
      }

      const titleKey = heading.title.toLowerCase()
      if (heading.level === 1 && titleKey === 'long-term memory') {
        flushCurrentContent()
        currentNode = null
        inDirectory = false
        continue
      }

      if (heading.level === 2 && titleKey === DIRECTORY_TITLE.toLowerCase()) {
        flushCurrentContent()
        currentNode = null
        inDirectory = true
        continue
      }

      if (inDirectory && heading.level > 2) {
        continue
      }

      inDirectory = false
      flushCurrentContent()

      const node: MemoryNode = {
        title: heading.title,
        content: '',
        children: [],
      }

      while (
        stack.length > 1 &&
        stack[stack.length - 1].level >= heading.level
      ) {
        stack.pop()
      }

      stack[stack.length - 1].node.children.push(node)
      stack.push({ level: heading.level, node })
      currentNode = node
    }

    flushCurrentContent()
    return root
  }

  private writeLongTermMemory(root: MemoryNode): void {
    fs.writeFileSync(
      this.longTermFile,
      this.renderLongTermMemory(root),
      'utf-8'
    )
  }

  private renderLongTermMemory(root: MemoryNode): string {
    const sections = [
      MEMORY_TITLE,
      '',
      `## ${DIRECTORY_TITLE}`,
      '',
      this.renderDirectory(root),
    ]
    const nodes = root.children
      .map((node) => this.renderNode(node, 2))
      .filter((content) => content.trim().length > 0)
      .join('\n\n')

    if (nodes) {
      sections.push('', nodes)
    }

    return `${sections.join('\n').trimEnd()}\n`
  }

  private renderDirectory(root: MemoryNode): string {
    if (root.children.length === 0) {
      return EMPTY_DIRECTORY
    }

    const slugCounts = new Map<string, number>()
    const lines: string[] = []
    const walk = (node: MemoryNode, depth: number) => {
      const baseSlug = slugifyHeading(node.title)
      const count = slugCounts.get(baseSlug) ?? 0
      slugCounts.set(baseSlug, count + 1)
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`
      const indent = '  '.repeat(depth)
      lines.push(`${indent}- [${node.title}](#${slug})`)

      for (const child of node.children) {
        walk(child, depth + 1)
      }
    }

    for (const child of root.children) {
      walk(child, 0)
    }

    return lines.join('\n')
  }

  private renderNode(node: MemoryNode, level: number): string {
    const headingLevel = Math.min(level, 6)
    const parts = [`${'#'.repeat(headingLevel)} ${node.title}`]
    const content = node.content.trim()
    if (content) {
      parts.push('', content)
    }

    for (const child of node.children) {
      parts.push('', this.renderNode(child, headingLevel + 1))
    }

    return parts.join('\n').trimEnd()
  }

  private ensureNode(root: MemoryNode, pathSegments: string[]): MemoryNode {
    let parent = root

    for (const title of pathSegments) {
      const existing = this.findChild(parent, title)
      if (existing) {
        parent = existing
        continue
      }

      const node: MemoryNode = { title, content: '', children: [] }
      parent.children.push(node)
      parent = node
    }

    return parent
  }

  private findRequiredNode(
    root: MemoryNode,
    pathSegments: string[]
  ): MemoryNode {
    return this.findNodeWithParent(root, pathSegments).node
  }

  private findNodeWithParent(
    root: MemoryNode,
    pathSegments: string[]
  ): { parent: MemoryNode; node: MemoryNode } {
    let parent = root
    let node: MemoryNode | null = null

    for (const title of pathSegments) {
      node = this.findChild(parent, title)
      if (!node) {
        throw new Error(`Memory path not found: ${pathSegments.join(' / ')}.`)
      }

      parent = node
    }

    if (!node) {
      throw new Error('Memory path is required.')
    }

    const parentPath = pathSegments.slice(0, -1)
    const actualParent =
      parentPath.length === 0 ? root : this.findRequiredNode(root, parentPath)
    return { parent: actualParent, node }
  }

  private findChild(parent: MemoryNode, title: string): MemoryNode | null {
    const matches = parent.children.filter((child) => child.title === title)
    if (matches.length > 1) {
      throw new Error(`Memory path is ambiguous at '${title}'.`)
    }

    return matches[0] ?? null
  }

  private deleteNode(root: MemoryNode, pathSegments: string[]): void {
    const { parent, node } = this.findNodeWithParent(root, pathSegments)
    parent.children = parent.children.filter((child) => child !== node)
  }

  private normalizeMemoryPath(
    value: string[] | undefined,
    options: { allowEmpty?: boolean } = {}
  ): string[] {
    const pathSegments = value ?? []
    if (!Array.isArray(pathSegments)) {
      throw new TypeError('Memory path must be an array of strings.')
    }

    const normalized = pathSegments.map((item) => this.normalizeTitle(item))
    if (!options.allowEmpty && normalized.length === 0) {
      throw new Error('Memory path is required.')
    }

    if (normalized.length > MAX_MEMORY_PATH_DEPTH) {
      throw new Error(
        `Memory path is too deep. Maximum depth is ${MAX_MEMORY_PATH_DEPTH}.`
      )
    }

    if (normalized[0]?.toLowerCase() === DIRECTORY_TITLE.toLowerCase()) {
      throw new Error(`'${DIRECTORY_TITLE}' is reserved.`)
    }

    return normalized
  }

  private normalizeTitle(value: unknown): string {
    if (typeof value !== 'string') {
      throw new TypeError('Memory path items must be strings.')
    }

    const title = value.trim()
    if (!title) {
      throw new Error('Memory path items cannot be empty.')
    }

    if (/[\r\n]/.test(title)) {
      throw new Error('Memory path items cannot contain line breaks.')
    }

    return title
  }

  private normalizeContent(value: unknown): string {
    if (typeof value !== 'string') {
      throw new TypeError('content is required.')
    }

    const content = normalizeLineEndings(value).trim()
    if (!content) {
      throw new Error('content is required.')
    }

    return content
  }

  private getSessionSummaryFile(sessionKey: string): string {
    return path.join(this.sessionsDir, `${safeSessionFilename(sessionKey)}.md`)
  }

  private readFileIfExists(filePath: string): string {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return ''
    }

    return fs.readFileSync(filePath, 'utf-8')
  }

  private cleanupDailyMemoryFiles(): void {
    for (const entry of fs.readdirSync(this.memoryDir)) {
      if (!DAILY_MEMORY_FILE_PATTERN.test(entry)) {
        continue
      }

      const filePath = path.join(this.memoryDir, entry)
      try {
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn(`[MemoryStore] failed to delete legacy memory: ${message}`)
      }
    }
  }
}
