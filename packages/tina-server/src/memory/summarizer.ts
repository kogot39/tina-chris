import { logger } from '@tina-chris/tina-util'

import type { MemoryStore } from './store'
import type { Message as ContextMessage } from '@mariozechner/pi-ai'

import type { Config } from '@/config'
import type { LLMManager } from '@/llm'
import type { Session, SessionDisplayMessage } from '@/session'

import { getAssistantText } from '@/llm/base'

const SUMMARY_MESSAGE_THRESHOLD = 10
const SUMMARY_MAX_TOKENS = 1200

const formatDisplayMessage = (
  message: SessionDisplayMessage
): string | null => {
  if (message.type === 'tool') {
    // 摘要里保留工具名称、状态和简短结果，足够让模型知道发生过什么；
    // 但不把完整参数/大结果强行塞进长期摘要，避免记忆膨胀。
    return [
      `tool:${message.toolName}`,
      `status: ${message.status}`,
      message.content ? `summary: ${message.content}` : '',
      message.error ? `error: ${message.error}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (message.type === 'user' || message.type === 'assistant') {
    return `${message.type}: ${message.content}`
  }

  // reasoning、speech 等消息只是桌面展示辅助，不进入长期摘要。
  // 这样可以避免私有思考内容或语音过程文本被写成 durable memory。
  return null
}

export class SessionMemorySummarizer {
  constructor(
    private memoryStore: MemoryStore,
    private llm: LLMManager,
    private config: Config
  ) {}

  shouldSummarize(session: Session): boolean {
    return (
      session.messages.length - this.getSummaryMessageCount(session) >=
      SUMMARY_MESSAGE_THRESHOLD
    )
  }

  async summarizeIfNeeded(session: Session): Promise<boolean> {
    if (!this.shouldSummarize(session)) {
      return false
    }

    const existingSummary = this.memoryStore
      .readSessionSummary(session.key)
      .trim()
    const unsummarizedMessages = session
      .getUnsummarizedMessages()
      .map(formatDisplayMessage)
      .filter((message): message is string => Boolean(message))
      .join('\n\n')

    const messages: ContextMessage[] = [
      {
        role: 'user',
        content: [
          '# Existing Summary',
          existingSummary || '(none)',
          '',
          '# Unsummarized Conversation Messages',
          unsummarizedMessages,
          '',
          'Return the complete updated summary.',
        ].join('\n'),
        timestamp: Date.now(),
      },
    ]

    const response = await this.llm.complete({
      context: {
        systemPrompt: [
          'You update compact session memory summaries for a desktop AI assistant.',
          'Keep durable user goals, preferences, decisions, project context, and unresolved next steps.',
          'Remove transient chatter, duplicate details, tool noise, and wording that is no longer useful.',
          'Write the updated summary in Markdown. Be concise but specific.',
        ].join('\n'),
        messages,
        tools: [],
      },
      // 摘要任务最多给 SUMMARY_MAX_TOKENS；如果用户 AgentConfig.maxTokens 留空，
      // 这里也传 null，让供应商默认值生效。
      maxTokens:
        typeof this.config.agent.maxTokens === 'number'
          ? Math.min(this.config.agent.maxTokens, SUMMARY_MAX_TOKENS)
          : null,
      temperature: 0.2,
      reasoningEffort: 'off',
    })

    const content = getAssistantText(response).trim()
    if (response.stopReason === 'error' || !content) {
      logger.warn('[SessionMemorySummarizer] summary update skipped')
      return false
    }

    this.memoryStore.writeSessionSummary(session.key, content)
    session.metadata.memorySummaryMessageCount = session.messages.length
    session.metadata.memorySummaryUpdatedAt = new Date().toISOString()
    return true
  }

  private getSummaryMessageCount(session: Session): number {
    const count = session.metadata.memorySummaryMessageCount
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      return 0
    }

    return Math.max(0, Math.min(session.messages.length, count))
  }
}
