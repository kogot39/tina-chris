import { logger } from '@tina-chris/tina-util'

import type { MemoryStore } from './store'

import type { Config } from '@/config'
import type { LLMManager } from '@/llm'
import type { Session } from '@/session'

// 会话摘要是“长会话压缩层”，不需要每轮都更新。
// 阈值过小会增加 LLM 调用成本，过大则长会话上下文容易变钝；v0 先固定为 10 条消息。
// TODO: 后续改为通过 maxTokens 计算更智能的摘要触发时机
const SUMMARY_MESSAGE_THRESHOLD = 10
// 摘要只读取最近一段历史和已有摘要合并，避免把整份 session 再次塞进摘要请求。
const SUMMARY_MAX_HISTORY_MESSAGES = 60
const SUMMARY_MAX_TOKENS = 1200

export class SessionMemorySummarizer {
  constructor(
    private memoryStore: MemoryStore,
    private llm: LLMManager,
    private config: Config
  ) {}

  shouldSummarize(session: Session): boolean {
    // metadata 由 SessionManager 原样持久化，所以摘要进度直接挂在 session metadata 上
    // 如果旧会话没有这些字段，就按 0 处理，让它在达到阈值后自然生成第一份摘要
    const lastCount =
      typeof session.metadata.memorySummaryMessageCount === 'number'
        ? session.metadata.memorySummaryMessageCount
        : 0

    return session.messages.length - lastCount >= SUMMARY_MESSAGE_THRESHOLD
  }

  async summarizeIfNeeded(session: Session): Promise<boolean> {
    if (!this.shouldSummarize(session)) {
      return false
    }

    // 摘要更新采用“已有摘要 + 最近消息”的增量方式。
    // 这样模型只需要维护最终摘要，不需要每次重新压缩全部历史。
    const existingSummary = this.memoryStore
      .readSessionSummary(session.key)
      .trim()
    const recentMessages = session.messages
      .slice(-SUMMARY_MAX_HISTORY_MESSAGES)
      .map((message) => {
        return `${message.role}: ${message.content}`
      })
      .join('\n\n')

    const response = await this.llm.chat({
      messages: [
        {
          role: 'system',
          content: [
            'You update compact session memory summaries for a desktop AI assistant.',
            'Keep durable user goals, preferences, decisions, project context, and unresolved next steps.',
            'Remove transient chatter, duplicate details, tool noise, and wording that is no longer useful.',
            'Write the updated summary in Markdown. Be concise but specific.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            '# Existing Summary',
            existingSummary || '(none)',
            '',
            '# Recent Conversation Messages',
            recentMessages,
            '',
            'Return the complete updated summary.',
          ].join('\n'),
        },
      ],
      tools: [],
      // 摘要调用不走流式、不提供工具，只让当前 LLM 做一次纯文本压缩。
      // model/maxTokens 仍沿用 Agent 配置，避免和用户当前选择的 LLM provider 脱节。
      model: this.config.agent.model || undefined,
      maxTokens: Math.min(this.config.agent.maxTokens, SUMMARY_MAX_TOKENS),
      temperature: 0.2,
      stream: false,
    })

    if (response.finishReason === 'error' || !response.content.trim()) {
      // 摘要属于后台增强能力。失败不应影响当前对话，所以只记录日志并返回 false。
      logger.warn('[SessionMemorySummarizer] summary update skipped')
      return false
    }

    // 写入成功后再更新 metadata，保证下次阈值计算和实际摘要文件保持一致。
    this.memoryStore.writeSessionSummary(session.key, response.content)
    session.metadata.memorySummaryMessageCount = session.messages.length
    session.metadata.memorySummaryUpdatedAt = new Date().toISOString()
    return true
  }
}
