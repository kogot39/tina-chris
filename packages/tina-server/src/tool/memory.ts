import { readString, readStringArray } from '@tina-chris/tina-util'

import type { MemoryScope, MemoryStore } from '@/memory'

import { MAX_MEMORY_DAYS_PER_READ, assertMemoryDate } from '@/memory'
import { Tool, type ToolParameters } from '@/tool/base'

// memory 工具只做参数解析和用户可读错误返回，真正的文件路径和安全限制都交给 MemoryStore
// 这样后续即使新增前端或其他内部调用，也不会绕过 workspace/memory 的边界

export class ReadMemoryTool extends Tool {
  private currentSessionKey = ''

  constructor(private memoryStore: MemoryStore) {
    super()
  }

  setContext(sessionKey: string): void {
    // 当前会话由 AgentLoop 在每轮工具调用前写入。
    // 这样模型读取 session_summary 时不需要知道真实 sessionKey，也能默认读取当前会话摘要。
    this.currentSessionKey = sessionKey
  }

  get name(): string {
    return 'readMemory'
  }

  get description(): string {
    return [
      'Read agent memory from the configured workspace.',
      'Can read long-term memory, today memory, a specific date, multiple dates, a date range, or the current session summary.',
    ].join(' ')
  }

  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: [
            'long_term',
            'today',
            'date',
            'dates',
            'range',
            'session_summary',
          ],
          description: 'Which memory layer to read.',
        },
        date: {
          type: 'string',
          description: 'Date to read, formatted as YYYY-MM-DD.',
        },
        dates: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dates to read, each formatted as YYYY-MM-DD. Maximum 14 days.',
        },
        startDate: {
          type: 'string',
          description: 'Inclusive range start, formatted as YYYY-MM-DD.',
        },
        endDate: {
          type: 'string',
          description: 'Inclusive range end, formatted as YYYY-MM-DD.',
        },
        sessionKey: {
          type: 'string',
          description:
            'Optional session key for session_summary. Defaults to the current conversation.',
        },
      },
      required: ['scope'],
    }
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const scope = readString(params, 'scope') as MemoryScope

    try {
      // 长期记忆和当天记忆是最常用的两层，所以提供简单 scope 直接读取。
      if (scope === 'long_term') {
        return this.memoryStore.readLongTerm().trim() || 'No long-term memory.'
      }

      if (scope === 'today') {
        const today = this.memoryStore.today
        const content = this.memoryStore.readDaily(today).trim()
        return content || `Error: No memory found for ${today}.`
      }

      if (scope === 'date') {
        // 指定日期读取用于“回忆某一天”的场景。
        // 日期格式在 Store 层会再次校验，这里只负责把错误转成工具结果。
        const date = assertMemoryDate(readString(params, 'date'))
        const content = this.memoryStore.readDaily(date).trim()
        return content || `Error: No memory found for ${date}.`
      }

      if (scope === 'dates') {
        // 多日期读取用于零散回忆，例如用户提到“上周一和周三”。
        // 这里先做空数组和显式上限检查，让模型能得到更直接的错误说明。
        const dates = readStringArray(params, 'dates')
        if (dates.length === 0) {
          return 'Error: dates is required for dates scope.'
        }
        if (dates.length > MAX_MEMORY_DAYS_PER_READ) {
          return `Error: Too many memory days requested. Maximum is ${MAX_MEMORY_DAYS_PER_READ}.`
        }
        return this.memoryStore.formatDailyMemories(
          this.memoryStore.readDailyDates(dates)
        )
      }

      if (scope === 'range') {
        // 日期范围读取用于连续时间段回忆，最终仍由 Store 统一限制最多 14 天。
        const startDate = readString(params, 'startDate')
        const endDate = readString(params, 'endDate')
        if (!startDate || !endDate) {
          return 'Error: startDate and endDate are required for range scope.'
        }
        return this.memoryStore.formatDailyMemories(
          this.memoryStore.readDailyRange(startDate, endDate)
        )
      }

      if (scope === 'session_summary') {
        // sessionKey 是可选参数。默认读取当前会话摘要，只有跨会话工具调用时才需要显式传入。
        const sessionKey =
          readString(params, 'sessionKey') || this.currentSessionKey
        if (!sessionKey) {
          return 'Error: sessionKey is required.'
        }
        return (
          this.memoryStore.readSessionSummary(sessionKey).trim() ||
          `No session summary for ${sessionKey}.`
        )
      }

      return `Error: Unsupported memory scope '${readString(params, 'scope')}'.`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error: ${message}`
    }
  }
}

export class RememberTool extends Tool {
  constructor(private memoryStore: MemoryStore) {
    super()
  }

  get name(): string {
    return 'remember'
  }

  get description(): string {
    return 'Append an important durable fact to long-term memory.'
  }

  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Important memory to append.',
        },
      },
      required: ['content'],
    }
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    // remember 只追加长期记忆，不提供覆盖或删除能力。
    // 这是为了让模型保存“持久事实”时尽量可追溯，后续人工审查也能看到每条追加记录。
    const content = readString(params, 'content').trim()
    if (!content) {
      return 'Error: content is required.'
    }

    try {
      this.memoryStore.appendLongTerm(content)
      return 'Memory saved to long-term memory.'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error: ${message}`
    }
  }
}

export class AppendDailyMemoryTool extends Tool {
  constructor(private memoryStore: MemoryStore) {
    super()
  }

  get name(): string {
    return 'appendDailyMemory'
  }

  get description(): string {
    return 'Append a note to daily memory. Defaults to today.'
  }

  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Daily memory note to append.',
        },
        date: {
          type: 'string',
          description:
            'Optional date formatted as YYYY-MM-DD. Defaults to today.',
        },
      },
      required: ['content'],
    }
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    // daily memory 允许指定日期，方便用户补记昨天/某天发生的事情。
    // 如果不传 date，则按用户本地今天写入。
    const content = readString(params, 'content').trim()
    const date = readString(params, 'date', this.memoryStore.today)
    if (!content) {
      return 'Error: content is required.'
    }

    try {
      const normalizedDate = assertMemoryDate(date)
      this.memoryStore.appendDaily(content, normalizedDate)
      return `Daily memory saved for ${normalizedDate}.`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error: ${message}`
    }
  }
}
