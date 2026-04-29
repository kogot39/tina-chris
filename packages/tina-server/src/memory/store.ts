import fs from 'fs'
import path from 'path'
import {
  addDays,
  formatLocalDate,
  formatLocalTimestamp,
  parseDate,
  safeFilename,
} from '@tina-chris/tina-util'

// MemoryStore 是 Agent 记忆模块的唯一文件读写入口。
// 这里刻意不复用通用文件工具，而是把所有路径固定在 workspace/memory 下，
// 避免模型通过 memory 工具读取或写入任意工作区文件。

// 多天记忆一次性读取会直接进入模型上下文，因此这里保守限制天数，
// 防止用户一句“回忆全部历史”把上下文窗口撑爆。
export const MAX_MEMORY_DAYS_PER_READ = 14

export type MemoryScope =
  | 'long_term'
  | 'today'
  | 'date'
  | 'dates'
  | 'range'
  | 'session_summary'

// 对外暴露的日期校验函数统一返回规范日期字符串，供工具层复用
export const assertMemoryDate = (value: string): string => {
  const date = parseDate(value)
  if (!date) {
    throw new Error(`Invalid date '${value}'. Expected YYYY-MM-DD.`)
  }
  return formatLocalDate(date)
}

// 多日期输入可能包含重复或无序的日期，统一去重和排序后再处理
const uniqueSortedDates = (dates: string[]): string[] => {
  return Array.from(new Set(dates.map(assertMemoryDate))).sort()
}

// sessionKey 里通常包含 channel/chatId 等分隔符，不适合直接作为文件名。
// 这里沿用 session 模块的 safeFilename 策略，保证摘要文件名稳定且跨平台可写。
const safeSessionFilename = (sessionKey: string): string => {
  const safeKey = safeFilename(sessionKey.replace(/:/g, '_'))
  return safeKey
}

export class MemoryStore {
  readonly memoryDir: string
  private readonly longTermFile: string
  private readonly sessionsDir: string

  constructor(workspacePath: string) {
    // 所有记忆都收束到 workspace/memory
    // 初始化时直接创建目录，后续工具读写就不需要重复判断目录是否存在
    this.memoryDir = path.join(workspacePath, 'memory')
    this.longTermFile = path.join(this.memoryDir, 'MEMORY.md')
    this.sessionsDir = path.join(this.memoryDir, 'sessions')
    fs.mkdirSync(this.memoryDir, { recursive: true })
    fs.mkdirSync(this.sessionsDir, { recursive: true })
  }

  get today(): string {
    // 记忆文件按本地日期命名，而不是 UTC 日期。
    // 桌面助手的交互是面向用户本地时间的，按本地日期拆 daily memory 更符合直觉。
    return formatLocalDate()
  }

  // 长期记忆用于保存跨会话仍然重要的事实，比如用户偏好、长期项目背景和稳定约定。
  readLongTerm(): string {
    return this.readFileIfExists(this.longTermFile)
  }

  appendLongTerm(content: string): void {
    const normalized = content.trim()
    if (!normalized) {
      throw new Error('memory content is required.')
    }

    if (!fs.existsSync(this.longTermFile)) {
      // 首次写入时给 MEMORY.md 一个固定标题，方便用户直接打开阅读和手动编辑。
      fs.writeFileSync(this.longTermFile, '# Long-term Memory\n', 'utf-8')
    }

    this.appendBlock(this.longTermFile, formatMemoryEntry(normalized))
  }

  readDaily(date = this.today): string {
    const normalizedDate = assertMemoryDate(date)
    return this.readFileIfExists(this.getDailyFile(normalizedDate))
  }

  // 每日记忆用于记录当天发生的事情或临时上下文。
  // 它比长期记忆更“新鲜”，但不会默认把多天历史全部塞进每轮上下文。
  appendDaily(content: string, date = this.today): void {
    const normalized = content.trim()
    if (!normalized) {
      throw new Error('daily memory content is required.')
    }

    const normalizedDate = assertMemoryDate(date)
    const filePath = this.getDailyFile(normalizedDate)
    if (!fs.existsSync(filePath)) {
      // daily 文件按日期分文件保存，标题也使用同一个日期，方便人工浏览。
      fs.writeFileSync(filePath, `# ${normalizedDate}\n`, 'utf-8')
    }

    this.appendBlock(filePath, formatMemoryEntry(normalized))
  }

  readDailyDates(dates: string[]): Array<{ date: string; content: string }> {
    // 多日期读取先去重并排序，保证输出顺序稳定，模型回忆时也更容易按时间理解。
    const normalizedDates = uniqueSortedDates(dates)
    this.assertDateReadLimit(normalizedDates.length)

    return normalizedDates.map((date) => ({
      date,
      content: this.readDaily(date),
    }))
  }

  readDailyRange(
    startDate: string,
    endDate: string
  ): Array<{ date: string; content: string }> {
    // range 读取是给 Agent “回忆一段时间”用的，所以使用闭区间。
    // 日期合法性和上限都在 Store 层处理，工具层只负责参数转发和错误展示。
    const start = parseDate(assertMemoryDate(startDate))
    const end = parseDate(assertMemoryDate(endDate))
    if (!start || !end) {
      throw new Error('Invalid date range.')
    }
    if (start.getTime() > end.getTime()) {
      throw new Error('startDate must be earlier than or equal to endDate.')
    }

    const dates: string[] = []
    for (let current = start; current <= end; current = addDays(current, 1)) {
      dates.push(formatLocalDate(current))
    }

    this.assertDateReadLimit(dates.length)
    return dates.map((date) => ({
      date,
      content: this.readDaily(date),
    }))
  }

  readSessionSummary(sessionKey: string): string {
    return this.readFileIfExists(this.getSessionSummaryFile(sessionKey))
  }

  // 会话摘要由 AgentLoop 的摘要器自动维护，不通过普通工具直接写入。
  // 它只记录当前会话的压缩上下文，避免长会话每轮都带完整历史。
  writeSessionSummary(sessionKey: string, content: string): void {
    const normalized = content.trim()
    const filePath = this.getSessionSummaryFile(sessionKey)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, normalized ? `${normalized}\n` : '', 'utf-8')
  }

  buildMemoryContext(sessionKey: string): string {
    // 每轮默认注入三层：长期记忆、当天记忆、当前会话摘要。
    // 指定日期/多日期/范围回忆不默认注入，而是通过 readMemory 工具按需读取。
    const parts: string[] = []
    const longTerm = this.readLongTerm().trim()
    const today = this.readDaily().trim()
    const sessionSummary = this.readSessionSummary(sessionKey).trim()

    if (longTerm) {
      parts.push(`## Long-term Memory\n\n${longTerm}`)
    }
    if (today) {
      parts.push(`## Today's Memory (${this.today})\n\n${today}`)
    }
    if (sessionSummary) {
      parts.push(`## Current Session Summary\n\n${sessionSummary}`)
    }

    return parts.length > 0 ? `# Memory\n\n${parts.join('\n\n')}` : ''
  }

  formatDailyMemories(items: Array<{ date: string; content: string }>): string {
    // 多天读取输出为 Markdown 分段，方便模型明确区分每天的内容。
    // 缺失的日期也显式返回，避免模型误以为读取失败或遗漏。
    return items
      .map(({ date, content }) => {
        const normalized = content.trim()
        if (!normalized) {
          return `## ${date}\n\nError: No memory found for ${date}.`
        }
        return `## ${date}\n\n${normalized}`
      })
      .join('\n\n---\n\n')
  }

  private getDailyFile(date: string): string {
    return path.join(this.memoryDir, `${assertMemoryDate(date)}.md`)
  }

  private getSessionSummaryFile(sessionKey: string): string {
    return path.join(this.sessionsDir, `${safeSessionFilename(sessionKey)}.md`)
  }

  private readFileIfExists(filePath: string): string {
    // 缺失记忆文件不是异常；空字符串让上层可以自然跳过该层上下文。
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return ''
    }

    return fs.readFileSync(filePath, 'utf-8')
  }

  private appendBlock(filePath: string, content: string): void {
    // 使用追加块而不是覆盖，减少模型误删已有记忆的风险。
    const existing = this.readFileIfExists(filePath)
    const separator = existing.trim().length > 0 ? '\n\n' : ''
    fs.writeFileSync(
      filePath,
      `${existing.trimEnd()}${separator}${content}\n`,
      'utf-8'
    )
  }

  private assertDateReadLimit(count: number): void {
    // 这个限制放在 Store 层，保证无论工具还是未来其他调用方都遵守同一条保护规则。
    if (count > MAX_MEMORY_DAYS_PER_READ) {
      throw new Error(
        `Too many memory days requested. Maximum is ${MAX_MEMORY_DAYS_PER_READ}.`
      )
    }
  }
}

const formatMemoryEntry = (content: string): string => {
  // 记忆条目统一带本地时间戳，方便用户后续人工审查或清理。
  return `- ${formatLocalTimestamp()}: ${content}`
}
