import { randomUUID } from 'crypto'
import {
  ConnectionEndMessage,
  ConnectionStartMessage,
  InboundMessage,
  MessageBus,
  OutboundMessage,
} from '@tina-chris/tina-bus'
import { logger, resolveWorkspacePath } from '@tina-chris/tina-util'
import { ContextBuilder } from './context'
import { SkillLoader } from './skills'

import type {
  AssistantMessage,
  AssistantMessageEvent,
  Message as ContextMessage,
  ToolCall,
} from '@mariozechner/pi-ai'

import type { Config } from '@/config'
import type {
  Session,
  SessionDisplayMessage,
  SessionDisplayMessageMetadata,
} from '@/session'

import { getAssistantText } from '@/llm/base'
import { LLMManager, createEmptyUsage } from '@/llm'
import { MemoryStore, SessionMemorySummarizer } from '@/memory'
import { SessionManager } from '@/session'
import { MessageTool, ToolRegistry, createDefaultToolRegistry } from '@/tool'

// AgentLoop 每次 initialize 重建这些依赖，确保提示词/工具配置变更后立即生效
type AgentLoopRuntime = {
  workspacePath: string
  sessionManager: SessionManager
  contextBuilder: ContextBuilder
  toolRegistry: ToolRegistry
  memorySummarizer: SessionMemorySummarizer
}

// 同一会话（channel:chatId）最多有一个活跃回复，新消息到达时通过 AbortController 中止上一轮
type ActiveResponse = {
  controller: AbortController
  source: InboundMessage
}

// TTS 延迟启动：只在第一条可播报文本到达时才打开语音连接，避免 thinking-only 回复也启动 TTS
type SpeechState = {
  enabled: boolean
  started: boolean
}

// reasoning 和 tool 各有独立时间戳，因为它们是独立展示消息，不与 assistant 正文时间轴合并
type AssistantDisplayTiming = {
  assistantTimestamp: number
  reasoningTimestamps: Map<number, number>
  toolTimestamps: Map<number, number>
}

// 工具调用需要同时知道 ToolCall 内容及其在 assistantMessage.content 中的索引，
// 这样才能把展示 id（包含 blockIndex）和 pi-ai context 中的 toolCall id 对起来
type ToolCallWithIndex = {
  toolCall: ToolCall
  contentIndex: number
}

// =========================================================================
// 消息构造辅助函数
// =========================================================================
// 每条用户/助手消息都有"双重形态"：
// - ContextMessage → 给 pi-ai 做上下文回放（含完整 toolCall/toolResult 链）
// - SessionDisplayMessage → 写入 JSONL 持久化 + 通过 bus 推给桌面端展示
// 两者分离是为了：JSONL 只存展示结构 + 最小 metadata，避免正文和工具参数重复存储。
// Session.getHistory() 会从展示消息重建 pi-ai Context。
// timestamp 统一由调用方传入，保证 bus 实时消息和 JSONL 落盘消息时间一致。
const createUserContextMessage = (
  content: string,
  timestamp: number
): ContextMessage => ({
  role: 'user',
  content,
  timestamp,
})

const createUserDisplayMessage = (
  id: string,
  content: string,
  turnId: string,
  timestamp: number
): SessionDisplayMessage => ({
  id,
  type: 'user',
  content,
  status: 'complete',
  timestamp,
  metadata: {
    turnId,
    contextRole: 'user',
  },
})

const formatToolContent = (toolCall: ToolCall): string => {
  return `Calling ${toolCall.name}`
}

// "synthetic" 消息不是模型生成的，而是 Tina 内部产生的（工具上限提示、空响应兜底等）。
// 但它们仍然要作为 assistant 角色写入 pi-ai context，否则下一轮模型不知道上一轮为何停止。
const createSyntheticAssistantMessage = (
  content: string,
  timestamp = Date.now()
): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: content }],
  api: 'openai-completions',
  provider: 'tina',
  model: 'loop',
  usage: createEmptyUsage(),
  stopReason: 'stop',
  timestamp,
})

const createAssistantDisplayTiming = (
  assistantTimestamp = Date.now()
): AssistantDisplayTiming => ({
  assistantTimestamp,
  reasoningTimestamps: new Map(),
  toolTimestamps: new Map(),
})

const getOrCreateTimestamp = (
  timestamps: Map<number, number>,
  contentIndex: number
): number => {
  const existing = timestamps.get(contentIndex)
  if (existing) return existing

  const timestamp = Date.now()
  timestamps.set(contentIndex, timestamp)
  return timestamp
}

const getToolCallsWithContentIndex = (
  message: AssistantMessage
): ToolCallWithIndex[] => {
  const calls: ToolCallWithIndex[] = []
  message.content.forEach((block, contentIndex) => {
    if (block.type === 'toolCall') {
      calls.push({ toolCall: block, contentIndex })
    }
  })
  return calls
}

const createAssistantContextMetadata = (
  message: AssistantMessage,
  turnId: string
): SessionDisplayMessageMetadata => ({
  turnId,
  api: message.api,
  provider: message.provider,
  model: message.model,
  usage: message.usage,
  stopReason: message.stopReason,
  errorMessage: message.errorMessage,
})

export class AgentLoop {
  private runtime: AgentLoopRuntime | null = null
  private initializationError: string | null = null
  // key = "channel:chatId"，保证同一会话最多一个活跃回复
  private activeResponses = new Map<string, ActiveResponse>()

  constructor(
    private config: Config,
    private bus: MessageBus,
    private llm: LLMManager
  ) {
    // 启动时立即构建 Runtime（SessionManager/ContextBuilder/ToolRegistry 等）
    this.initialize()

    // 订阅 bus 上的 'agent' 入站消息，这是所有用户请求的统一入口
    this.bus.subscribeInbound('agent', async (message) => {
      await this.processInboundMessage(message)
    })
  }

  // initialize 会在应用启动和 Agent/Tool/Channel 配置保存后调用。
  // 全量重建 Runtime 是因为 workspace/提示词/工具/记忆路径可能随配置变化。
  initialize(): void {
    this.runtime = null
    this.initializationError = null

    try {
      const workspacePath = resolveWorkspacePath(this.config.agent.workspace)
      const memoryStore = new MemoryStore(workspacePath)
      const skills = new SkillLoader(workspacePath)

      this.runtime = {
        workspacePath,
        sessionManager: new SessionManager(workspacePath),
        contextBuilder: new ContextBuilder(workspacePath, memoryStore, skills),
        toolRegistry: createDefaultToolRegistry({
          config: this.config,
          workspacePath,
          bus: this.bus,
          memoryStore,
        }),
        memorySummarizer: new SessionMemorySummarizer(
          memoryStore,
          this.llm,
          this.config
        ),
      }
    } catch (error) {
      this.initializationError =
        error instanceof Error ? error.message : String(error)
    }
  }

  // 显式停止：用户点击 stop 按钮时调用
  abortSession(channel: string, chatId: string): boolean {
    const sessionKey = `${channel}:${chatId}`
    const active = this.activeResponses.get(sessionKey)
    if (!active) {
      return false
    }

    // AbortController 是 LLM 请求的唯一取消源。流式回调也检查同一 signal，
    // 避免 provider 已经发出的延迟 chunk 在用户点击停止后继续写入桌面端或 TTS。
    active.controller.abort()
    // 关闭 TTS 语音会话（如果有的话）
    this.finishSpeech(active.source)
    return true
  }

  // 所有外部用户消息的入口：过滤非文本 → 去空白 → 主处理 → 兜底捕获
  private async processInboundMessage(message: InboundMessage): Promise<void> {
    if (message.type !== 'text') {
      return
    }

    const content = message.content.trim()
    if (!content) {
      return
    }

    try {
      await this.processTextMessage(message, content)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.error(`[AgentLoop] ${reason}`)
      this.publishError(message, reason)
    }
  }

  // =========================================================================
  // 核心处理链路
  // =========================================================================
  private async processTextMessage(
    message: InboundMessage,
    content: string
  ): Promise<void> {
    // ---- 阶段 1：前置准备 ----
    const runtime = this.getRuntime()
    if (!runtime) {
      this.publishError(
        message,
        this.initializationError || 'Agent is not ready.'
      )
      return
    }

    const session = runtime.sessionManager.getOrCreate(message.sessionKey)

    // MessageTool 需要知道回复目标（channel/chatId），但不能放入工具 schema（避免模型可编辑）
    const messageTool = runtime.toolRegistry.get('message')
    if (messageTool instanceof MessageTool) {
      messageTool.setContext(message.channel, message.chatId)
    }

    // 同一会话新消息到达时，中止上一轮未完成的回复。
    // 和显式 stop 按钮走同一套 AbortController + finishSpeech 逻辑，避免两轮回复交错。
    const existing = this.activeResponses.get(message.sessionKey)
    if (existing) {
      existing.controller.abort()
      this.finishSpeech(existing.source)
    }

    // 注册本轮活跃回复（后续的 LLM 流式回调、工具执行都受此 AbortController 管理）
    const controller = new AbortController()
    this.activeResponses.set(message.sessionKey, {
      controller,
      source: message,
    })

    const tools = runtime.toolRegistry.getDefinitions()

    // Channel 分流：desktop 走 stream（实时推送事件 + TTS），远程走 complete（一次性响应）
    const shouldStream = message.channel === 'desktop'

    // 构造用户消息的"双重形态"
    const userTimestamp = Date.now()
    const userContextMessage = createUserContextMessage(content, userTimestamp)
    const userDisplayMessage = createUserDisplayMessage(
      randomUUID(),
      content,
      randomUUID(), // turnId：每轮对话一个唯一 id，用于后续按轮分组重建 context
      userTimestamp
    )
    // sessionMessages 是最终写入 JSONL 的消息合集（本轮的 user + assistant + tool + reasoning）
    const sessionMessages: SessionDisplayMessage[] = [userDisplayMessage]

    if (shouldStream) {
      // 桌面端不本地乐观插入 user 消息，而是等 AgentLoop 回发确认。
      // 这样 UI、bus、JSONL 中的 id/timestamp 都来自服务端同一份对象。
      this.publishSessionDisplayMessage(message, userDisplayMessage)
    }

    // TTS 延迟启动：enabled 仅当 desktop + 有配置 TTS 提供商，但 started=false，
    // 要到第一条 onTextDelta 回调才真正打开连接（避免 thinking-only 响应也启动语音）
    const speech: SpeechState = {
      enabled: shouldStream && Boolean(this.config.tts.current),
      started: false,
    }

    // 构建 LLM 上下文：历史消息 + 当前用户消息 + 工具定义 + 系统提示词
    const context = runtime.contextBuilder.buildContext(
      session.getHistory(),
      userContextMessage,
      {
        sessionKey: message.sessionKey,
        tools,
      }
    )

    let finalContent = ''
    let toolRounds = 0
    const maxToolRounds = Math.max(0, this.config.agent.maxToolInteractions)

    // 通知前端本轮回复正式开始（桌面端用于 isPlaying 状态切换）
    this.publishResponseLifecycle(message, 'response_start')

    // ---- 阶段 2：LLM 调用 + 工具循环 ----
    try {
      // 外层 while：每次循环 = 一次 LLM 调用 + 可能的多工具执行。
      // 只要模型返回 toolCall 且未超上限，就会继续循环让模型处理工具结果。
      while (!controller.signal.aborted) {
        const assistantId = randomUUID()
        const assistantTurnId = randomUUID()
        const displayTiming = createAssistantDisplayTiming()

        // Channel 分流：desktop 用 stream（实时推送 thinking/tool/text 事件 + 驱动 TTS），
        // 远程 channel 用 complete（一次性获取完整响应，内部展示事件不泄漏到外部平台）
        const assistantMessage = shouldStream
          ? await this.llm.stream({
              context,
              maxTokens: this.config.agent.maxTokens,
              temperature: this.config.agent.temperature,
              reasoningEffort: this.config.agent.reasoningEffort,
              signal: controller.signal,
              sessionId: message.sessionKey,
              callbacks: this.createStreamCallbacks(
                message,
                assistantId,
                assistantTurnId,
                speech,
                controller.signal,
                displayTiming
              ),
            })
          : await this.llm.complete({
              context,
              maxTokens: this.config.agent.maxTokens,
              temperature: this.config.agent.temperature,
              reasoningEffort: this.config.agent.reasoningEffort,
              signal: controller.signal,
              sessionId: message.sessionKey,
            })

        // ---- 异常/终止处理 ----
        const stopReason = assistantMessage.stopReason
        if (stopReason === 'error' || stopReason === 'aborted') {
          const status = stopReason === 'aborted' ? 'aborted' : 'error'
          // stream 模式：错误状态已由 onError 回调增量发送，这里只补最终状态
          // complete 模式：没有增量回调，需要把已获取的文本一次性推送出去
          if (!shouldStream) {
            this.publishAssistantFromMessage(
              message,
              assistantId,
              assistantMessage,
              displayTiming
            )
          } else {
            this.publishDisplayText(message, {
              id: assistantId,
              displayType: 'assistant',
              status,
              content: '',
              timestamp: displayTiming.assistantTimestamp,
              metadata: {
                turnId: assistantTurnId,
                contextRole: 'assistant',
              },
            })
          }
          sessionMessages.push(
            ...this.assistantMessageToDisplayMessages(
              assistantId,
              assistantMessage,
              status,
              assistantTurnId,
              displayTiming
            )
          )
          finalContent = getAssistantText(assistantMessage)
          break
        }

        // ---- 正常响应 ----
        // complete 模式下没有流式回调，需要在这里补发完整 assistant 消息到 bus
        if (!shouldStream) {
          this.publishAssistantFromMessage(
            message,
            assistantId,
            assistantMessage,
            displayTiming
          )
        }

        // 将 assistant 展示消息收进 JSONL 合集
        sessionMessages.push(
          ...this.assistantMessageToDisplayMessages(
            assistantId,
            assistantMessage,
            'complete',
            assistantTurnId,
            displayTiming
          )
        )

        // 把 assistantMessage 写入 pi-ai context。这是工具回放的关键：
        // 后续 toolResult 必须引用相同的 toolCall.id，pi-ai 才能正确拼接工具链。
        context.messages.push(assistantMessage)
        finalContent = getAssistantText(assistantMessage)

        // ---- 工具调用检测 ----
        const toolCalls = getToolCallsWithContentIndex(assistantMessage)
        if (toolCalls.length === 0) {
          // 无工具调用 → 本轮结束，跳出 while 循环
          break
        }

        // ---- 工具轮次上限保护 ----
        // 防止模型陷入工具调用循环无限消耗 token。超限时生成 synthetic 消息写入
        // context，让下一轮模型知道上一轮为何停止。
        if (toolRounds >= maxToolRounds) {
          const limitMessage =
            'Agent stopped because the configured tool interaction limit was reached.'
          const limitAssistantId = randomUUID()
          const limitAssistantTurnId = randomUUID()
          const limitTimestamp = Date.now()
          const limitContextMessage = createSyntheticAssistantMessage(
            limitMessage,
            limitTimestamp
          )
          finalContent = limitMessage
          this.publishAssistantText(
            message,
            limitMessage,
            limitAssistantId,
            'complete',
            limitTimestamp,
            {
              turnId: limitAssistantTurnId,
              contextRole: 'assistant',
            }
          )
          sessionMessages.push({
            id: limitAssistantId,
            type: 'assistant',
            content: limitMessage,
            status: 'complete',
            timestamp: limitTimestamp,
            metadata: {
              ...createAssistantContextMetadata(
                limitContextMessage,
                limitAssistantTurnId
              ),
              contextRole: 'assistant',
              blockIndex: 0,
            },
          })
          context.messages.push(limitContextMessage)
          break
        }

        // ---- 执行工具调用 ----
        toolRounds += 1
        for (const { toolCall, contentIndex } of toolCalls) {
          if (controller.signal.aborted) {
            break
          }

          logger.info(
            `[AgentLoop] Tool call: ${toolCall.name}(${JSON.stringify(
              toolCall.arguments
            )})`
          )
          const result = await runtime.toolRegistry.executeToolCall(
            tools,
            toolCall
          )
          logger.info(
            `[AgentLoop] Tool executed: ${toolCall.name}, result: ${result.resultText}`
          )

          // 工具结果写入 context.messages，pi-ai 用 toolCallId 关联回放
          context.messages.push(result.message)

          // 工具展示 id = assistantId:tool:contentIndex，与流式回调中 onToolCallEnd 的 id 一致。
          // 桌面端收到后按同 id upsert（calling → complete/error），JSONL 也是同 id 一条消息。
          const toolDisplayId = `${assistantId}:tool:${contentIndex}`
          const toolTimestamp = getOrCreateTimestamp(
            displayTiming.toolTimestamps,
            contentIndex
          )
          this.publishToolResult(
            message,
            toolCall,
            result.resultText,
            result.isError,
            toolDisplayId,
            toolTimestamp,
            {
              turnId: assistantTurnId,
              contextRole: 'tool',
              blockIndex: contentIndex,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            }
          )
          this.appendToolResultDisplayMessage(
            sessionMessages,
            toolCall,
            result.resultText,
            result.isError,
            toolDisplayId,
            toolTimestamp
          )
        }
        // while 循环回到顶部，让模型继续处理工具结果，直到没有 toolCall 或超限
      }

      // ---- 阶段 3：收尾清理 ----
      if (controller.signal.aborted) {
        finalContent = finalContent || 'Response aborted.'
      }
    } finally {
      // 从 activeResponses 中注销本轮（只在仍由当前 controller 掌管时才清理，
      // 防止新的 controller 刚写入就被 finally 误删）
      const active = this.activeResponses.get(message.sessionKey)
      if (active?.controller === controller) {
        this.activeResponses.delete(message.sessionKey)
      }
      // 不论正常完成、超限、报错还是 abort，都发送 TTS 结束信号。
      // TTSManager 会根据是否有 pending 文本决定 commit 或闲置关闭。
      this.finishSpeech(message)

      // 通知前端本轮回复结束（对应 processTextMessage 入口处的 response_start）
      this.publishResponseLifecycle(message, 'response_end')
    }

    // ---- 阶段 4：空响应兜底 ----
    // 如果 LLM 返回空（如模型异常、工具消耗了所有输出），生成兜底回复。
    // 这也是 synthetic 消息，需要写入 context 以免模型/用户感觉"跳了一段"。
    if (!finalContent && !controller.signal.aborted) {
      finalContent =
        'I completed processing, but no final response was generated.'
      const fallbackAssistantId = randomUUID()
      const fallbackAssistantTurnId = randomUUID()
      const fallbackTimestamp = Date.now()
      const fallbackContextMessage = createSyntheticAssistantMessage(
        finalContent,
        fallbackTimestamp
      )
      this.publishAssistantText(
        message,
        finalContent,
        fallbackAssistantId,
        'complete',
        fallbackTimestamp,
        {
          turnId: fallbackAssistantTurnId,
          contextRole: 'assistant',
        }
      )
      sessionMessages.push({
        id: fallbackAssistantId,
        type: 'assistant',
        content: finalContent,
        status: 'complete',
        timestamp: fallbackTimestamp,
        metadata: {
          ...createAssistantContextMetadata(
            fallbackContextMessage,
            fallbackAssistantTurnId
          ),
          contextRole: 'assistant',
          blockIndex: 0,
        },
      })
    }

    // ---- 阶段 5：持久化会话 ----
    // JSONL 只存展示消息结构 + 最小 context metadata。
    // session.getHistory() 用 turnId + blockIndex + contextRole 重建 pi-ai Context。
    session.addMessages(sessionMessages)
    runtime.sessionManager.save(session)

    // 异步触发记忆摘要：检查会话是否超长，必要时用 LLM 摘要早期消息
    this.scheduleSessionSummary(runtime, session)
  }

  private getRuntime(): AgentLoopRuntime | null {
    return this.runtime
  }

  private scheduleSessionSummary(
    runtime: AgentLoopRuntime,
    session: Session
  ): void {
    runtime.memorySummarizer
      .summarizeIfNeeded(session)
      .then((updated) => {
        if (updated) {
          runtime.sessionManager.save(session)
        }
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error)
        logger.warn(`[AgentLoop] session memory summary skipped: ${reason}`)
      })
  }

  // =========================================================================
  // 流式回调（仅 desktop channel）
  // =========================================================================
  // pi-ai 的 contentIndex 是 assistant.content 数组索引。
  // UI upsert 需要稳定 id，所以每个 thinking/tool 块按 index 缓存一份展示 id，
  // 保证 delta → end 过程中同一块永远用同一个 id。
  private createStreamCallbacks(
    source: InboundMessage,
    assistantId: string,
    assistantTurnId: string,
    speech: SpeechState,
    signal: AbortSignal,
    timing: AssistantDisplayTiming
  ) {
    const reasoningIds = new Map<number, string>()
    const toolIds = new Map<number, string>()

    const getReasoningId = (index: number) => {
      const existing = reasoningIds.get(index)
      if (existing) return existing
      const id = `${assistantId}:reasoning:${index}`
      reasoningIds.set(index, id)
      return id
    }

    const getToolId = (index: number) => {
      const existing = toolIds.get(index)
      if (existing) return existing
      const id = `${assistantId}:tool:${index}`
      toolIds.set(index, id)
      return id
    }

    const getReasoningTimestamp = (index: number) =>
      getOrCreateTimestamp(timing.reasoningTimestamps, index)

    const getToolTimestamp = (index: number) =>
      getOrCreateTimestamp(timing.toolTimestamps, index)

    // abort 后只放行最终的 error(aborted) 事件（用于 UI 状态标记）。
    // 其他在路上的 delta chunk 全部丢弃，避免”停止后还在长字”。
    const skipIfAborted = (event: AssistantMessageEvent): boolean => {
      if (!signal.aborted) {
        return false
      }
      if (event.type === 'error') {
        return false
      }
      return true
    }

    return {
      // 普通文本 delta：同时进入桌面展示和 TTS 语音播报
      onTextDelta: async (
        event: Extract<AssistantMessageEvent, { type: 'text_delta' }>
      ) => {
        if (skipIfAborted(event) || !event.delta) return
        this.publishAssistantText(
          source,
          event.delta,
          assistantId,
          'streaming',
          timing.assistantTimestamp,
          {
            turnId: assistantTurnId,
            contextRole: 'assistant',
            blockIndex: event.contentIndex,
          }
        )
        this.publishSpeechText(source, event.delta, speech)
      },
      onTextEnd: async () => {
        if (signal.aborted) return
        this.publishDisplayText(source, {
          id: assistantId,
          displayType: 'assistant',
          status: 'complete',
          content: '',
          timestamp: timing.assistantTimestamp,
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'assistant',
          },
        })
      },
      // reasoning（thinking）以独立展示消息呈现，不入 TTS 播报
      onThinkingDelta: async (
        event: Extract<AssistantMessageEvent, { type: 'thinking_delta' }>
      ) => {
        if (skipIfAborted(event) || !event.delta) return
        this.publishDisplayText(source, {
          id: getReasoningId(event.contentIndex),
          displayType: 'reasoning',
          status: 'streaming',
          content: event.delta,
          timestamp: getReasoningTimestamp(event.contentIndex),
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'reasoning',
            blockIndex: event.contentIndex,
          },
        })
      },
      onThinkingEnd: async (
        event: Extract<AssistantMessageEvent, { type: 'thinking_end' }>
      ) => {
        if (signal.aborted) return
        this.publishDisplayText(source, {
          id: getReasoningId(event.contentIndex),
          displayType: 'reasoning',
          status: 'complete',
          content: '',
          timestamp: getReasoningTimestamp(event.contentIndex),
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'reasoning',
            blockIndex: event.contentIndex,
          },
        })
      },
      // 工具调用：start → delta（参数逐步补全）→ end（最终参数），桌面端按 id upsert
      onToolCallStart: async (
        event: Extract<AssistantMessageEvent, { type: 'toolcall_start' }>
      ) => {
        if (skipIfAborted(event)) return
        this.publishToolCall(source, getToolId(event.contentIndex), {
          content: 'Preparing tool call',
          timestamp: getToolTimestamp(event.contentIndex),
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'tool',
            blockIndex: event.contentIndex,
          },
        })
      },
      onToolCallDelta: async (
        event: Extract<AssistantMessageEvent, { type: 'toolcall_delta' }>
      ) => {
        if (skipIfAborted(event)) return
        const partial = event.partial.content[event.contentIndex]
        if (partial?.type !== 'toolCall') return
        this.publishToolCall(source, getToolId(event.contentIndex), {
          toolName: partial.name,
          parameters: partial.arguments,
          content: formatToolContent(partial),
          timestamp: getToolTimestamp(event.contentIndex),
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'tool',
            blockIndex: event.contentIndex,
            toolCallId: partial.id,
            toolName: partial.name,
          },
        })
      },
      onToolCallEnd: async (
        event: Extract<AssistantMessageEvent, { type: 'toolcall_end' }>
      ) => {
        if (skipIfAborted(event)) return
        // onToolCallEnd 的 id 和后续 publishToolResult 的 id 一致（同为 assistantId:tool:contentIndex），
        // 桌面端先收到 calling 卡，工具执行完再被 result upsert 为 complete/error。
        this.publishToolCall(source, getToolId(event.contentIndex), {
          toolName: event.toolCall.name,
          parameters: event.toolCall.arguments,
          content: formatToolContent(event.toolCall),
          toolCallId: event.toolCall.id,
          timestamp: getToolTimestamp(event.contentIndex),
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'tool',
            blockIndex: event.contentIndex,
            toolCallId: event.toolCall.id,
            toolName: event.toolCall.name,
          },
        })
      },
      // error 回调：标记 assistant + reasoning + tool 全部展示消息为 error/aborted
      onError: async (
        event: Extract<AssistantMessageEvent, { type: 'error' }>
      ) => {
        const status = event.reason === 'aborted' ? 'aborted' : 'error'
        this.publishDisplayText(source, {
          id: assistantId,
          displayType: 'assistant',
          status,
          content: '',
          timestamp: timing.assistantTimestamp,
          metadata: {
            turnId: assistantTurnId,
            contextRole: 'assistant',
          },
        })
        for (const [contentIndex, id] of reasoningIds) {
          this.publishDisplayText(source, {
            id,
            displayType: 'reasoning',
            status,
            content: '',
            timestamp: getReasoningTimestamp(contentIndex),
            metadata: {
              turnId: assistantTurnId,
              contextRole: 'reasoning',
              blockIndex: contentIndex,
            },
          })
        }
        for (const [contentIndex, id] of toolIds) {
          this.publishDisplayText(source, {
            id,
            displayType: 'tool',
            status,
            content: '',
            timestamp: getToolTimestamp(contentIndex),
            metadata: {
              turnId: assistantTurnId,
              contextRole: 'tool',
              blockIndex: contentIndex,
            },
          })
        }
      },
    }
  }

  // =========================================================================
  // 展示消息转换
  // =========================================================================
  // 一个 assistantMessage 可能同时包含 thinking + text + toolCall 多种块。
  // 展示层拆成 assistant / reasoning / tool 多条独立消息，方便 UI 按类型渲染。
  // JSONL 只存这些展示消息，session.getHistory() 按 turnId + blockIndex 重建 pi-ai assistant message。
  private assistantMessageToDisplayMessages(
    assistantId: string,
    message: AssistantMessage,
    status: 'complete' | 'error' | 'aborted',
    turnId: string,
    timing: AssistantDisplayTiming
  ): SessionDisplayMessage[] {
    const baseMetadata = createAssistantContextMetadata(message, turnId)
    const items: Array<{ blockIndex: number; message: SessionDisplayMessage }> =
      []
    const textBlocks: Array<{ blockIndex: number; text: string }> = []

    message.content.forEach((block, index) => {
      if (block.type === 'thinking') {
        if (!timing.reasoningTimestamps.has(index)) {
          timing.reasoningTimestamps.set(index, timing.assistantTimestamp)
        }
        items.push({
          blockIndex: index,
          message: {
            id: `${assistantId}:reasoning:${index}`,
            type: 'reasoning',
            content: block.thinking,
            status,
            timestamp:
              timing.reasoningTimestamps.get(index) ??
              timing.assistantTimestamp,
            metadata: {
              turnId,
              contextRole: 'reasoning',
              blockIndex: index,
            },
          },
        })
        return
      }

      if (block.type === 'text') {
        textBlocks.push({ blockIndex: index, text: block.text })
        return
      }

      if (block.type === 'toolCall') {
        if (!timing.toolTimestamps.has(index)) {
          timing.toolTimestamps.set(index, timing.assistantTimestamp)
        }
        items.push({
          blockIndex: index,
          message: {
            id: `${assistantId}:tool:${index}`,
            type: 'tool',
            toolName: block.name,
            parameters: block.arguments,
            content: formatToolContent(block),
            // 正常工具调用先标为 "calling"，等工具执行完后由 appendToolResultDisplayMessage
            // 按同一 id upsert 为 complete/error。但如果整个 assistant 已 error/aborted，
            // 直接标成终止态（不会再有工具结果来 upsert 它）。
            status: status === 'complete' ? 'calling' : status,
            timestamp:
              timing.toolTimestamps.get(index) ?? timing.assistantTimestamp,
            metadata: {
              turnId,
              contextRole: 'tool',
              blockIndex: index,
              toolCallId: block.id,
              toolName: block.name,
            },
          },
        })
      }
    })

    const text = textBlocks.map((block) => block.text).join('')
    if (text || status !== 'complete') {
      items.push({
        blockIndex: textBlocks[0]?.blockIndex ?? 0,
        message: {
          id: assistantId,
          type: 'assistant',
          content: text || message.errorMessage || '',
          status,
          timestamp: timing.assistantTimestamp,
          metadata: {
            turnId,
            contextRole: 'assistant',
            blockIndex: textBlocks[0]?.blockIndex ?? 0,
          },
        },
      })
    }

    // 按 blockIndex 排序，保证展示顺序和 context 中的块顺序一致
    const sortedMessages = items
      .sort((a, b) => a.blockIndex - b.blockIndex)
      .map((item) => item.message)

    // api/provider/model/usage/stopReason 属于 assistant 整体元数据，只挂到同 turnId
    // 的第一条展示消息上。其他块只保留自身重组所需的最小字段（contextRole + blockIndex）。
    if (sortedMessages.length > 0) {
      sortedMessages[0] = {
        ...sortedMessages[0],
        metadata: {
          ...baseMetadata,
          ...sortedMessages[0].metadata,
        },
      }
    }

    return sortedMessages
  }

  // 工具结果的 upsert 逻辑：
  // 1. 如果 assistantMessageToDisplayMessages 已创建了同 id 的 calling 卡 → upsert
  // 2. 如果找不到（极端情况，比如前面没走 assistantMessageToDisplayMessages）→ 直接 push
  // upsert 时保留原始 timestamp，保证 calling → complete 过程中时间一致。
  private appendToolResultDisplayMessage(
    messages: SessionDisplayMessage[],
    toolCall: ToolCall,
    resultText: string,
    isError: boolean,
    displayId: string,
    timestamp: number
  ): void {
    const resultMessage = this.toolResultToDisplayMessage(
      toolCall,
      resultText,
      isError,
      displayId,
      timestamp
    )
    const existingIndex = messages.findIndex(
      (message) => message.id === displayId && message.type === 'tool'
    )

    if (existingIndex === -1) {
      messages.push(resultMessage)
      return
    }

    const existing = messages[existingIndex]
    if (existing.type !== 'tool') {
      messages.push(resultMessage)
      return
    }

    // 合并参数和结果到同一条消息，桌面端按 id upsert，JSONL 存最终形态。
    // timestamp 保持工具卡创建时的值不变，后续结果不改变展示时间。
    messages[existingIndex] = {
      ...existing,
      ...resultMessage,
      timestamp: existing.timestamp,
      metadata: {
        ...existing.metadata,
        ...resultMessage.metadata,
      },
    }
  }

  private toolResultToDisplayMessage(
    toolCall: ToolCall,
    resultText: string,
    isError: boolean,
    displayId: string,
    timestamp: number
  ): SessionDisplayMessage {
    return {
      id: displayId,
      type: 'tool',
      toolName: toolCall.name,
      parameters: toolCall.arguments,
      result: resultText,
      error: isError ? resultText : undefined,
      content: isError
        ? `Tool ${toolCall.name} failed`
        : `Tool ${toolCall.name} completed`,
      status: isError ? 'error' : 'complete',
      timestamp,
      metadata: {
        contextRole: 'tool',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        isError,
      },
    }
  }

  private publishAssistantFromMessage(
    source: InboundMessage,
    id: string,
    message: AssistantMessage,
    timing: AssistantDisplayTiming
  ): void {
    // 非桌面 channel 使用 complete，没有流式回调；这里把完整 assistantMessage
    // 转成外部可见文本。thinking 仍只在 desktop 展示。
    for (const [index, block] of message.content.entries()) {
      if (block.type === 'thinking' && source.channel === 'desktop') {
        this.publishDisplayText(source, {
          id: `${id}:reasoning:${index}`,
          displayType: 'reasoning',
          status: 'complete',
          content: block.thinking,
          timestamp: getOrCreateTimestamp(timing.reasoningTimestamps, index),
        })
      }
      if (block.type === 'text') {
        this.publishAssistantText(
          source,
          block.text,
          id,
          'complete',
          timing.assistantTimestamp
        )
      }
    }
  }

  private publishAssistantText(
    source: InboundMessage,
    content: string,
    id: string,
    status: 'streaming' | 'complete' | 'error' | 'aborted',
    timestamp: number,
    metadata?: Record<string, unknown>
  ): void {
    this.publishDisplayText(source, {
      id,
      displayType: 'assistant',
      status,
      content,
      timestamp,
      metadata,
    })
  }

  private publishSessionDisplayMessage(
    source: InboundMessage,
    message: SessionDisplayMessage
  ): void {
    const metadata: Record<string, unknown> = { ...message.metadata }
    if (message.type === 'tool') {
      metadata.toolName = message.toolName
      metadata.parameters = message.parameters
      metadata.result = message.result
      metadata.error = message.error
      metadata.toolCallId = message.metadata?.toolCallId
    }

    this.publishDisplayText(source, {
      id: message.id,
      displayType: message.type,
      status: message.status,
      content: message.content,
      timestamp: message.timestamp,
      metadata,
    })
  }

  // 所有展示消息的统一出口：bus 外层 type 保持 "text"，兼容已有通道消费逻辑；
  // 真正的展示语义（user/assistant/reasoning/tool + streaming/complete/error）
  // 放在 metadata.displayType + displayStatus 中。
  private publishDisplayText(
    source: InboundMessage,
    payload: {
      id: string
      displayType: 'user' | 'assistant' | 'speech_text' | 'reasoning' | 'tool'
      status: string
      content: string
      timestamp: number
      metadata?: Record<string, unknown>
    }
  ): void {
    this.bus.publishOutbound(
      new OutboundMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        type: 'text',
        content: payload.content,
        timestamp: payload.timestamp,
        metadata: {
          id: payload.id,
          displayType: payload.displayType,
          displayStatus: payload.status,
          ...payload.metadata,
        },
      })
    )
  }

  // 工具调用细节只发给 desktop，远程 channel 不暴露内部工具参数
  private publishToolCall(
    source: InboundMessage,
    id: string,
    payload: {
      toolName?: string
      parameters?: unknown
      content?: string
      toolCallId?: string
      timestamp: number
      metadata?: Record<string, unknown>
    }
  ): void {
    if (source.channel !== 'desktop') {
      return
    }

    // 工具调用细节只发给桌面端展示，避免远程聊天平台看到内部工具参数。
    this.publishDisplayText(source, {
      id,
      displayType: 'tool',
      status: 'calling',
      content: payload.content || '',
      timestamp: payload.timestamp,
      metadata: {
        ...payload.metadata,
        toolName: payload.toolName,
        parameters: payload.parameters,
        toolCallId: payload.toolCallId,
      },
    })
  }

  private publishToolResult(
    source: InboundMessage,
    toolCall: ToolCall,
    resultText: string,
    isError: boolean,
    displayId: string,
    timestamp: number,
    metadata?: Record<string, unknown>
  ): void {
    if (source.channel !== 'desktop') {
      return
    }

    this.publishDisplayText(source, {
      id: displayId,
      displayType: 'tool',
      status: isError ? 'error' : 'complete',
      content: isError
        ? `Tool ${toolCall.name} failed`
        : `Tool ${toolCall.name} completed`,
      timestamp,
      metadata: {
        ...metadata,
        toolName: toolCall.name,
        parameters: toolCall.arguments,
        result: resultText,
        error: isError ? resultText : undefined,
        toolCallId: toolCall.id,
      },
    })
  }

  // TTS 延迟启动：第一条可播报文本到达时才发 ConnectionStartMessage 打开语音连接。
  // 这样 thinking-only 或 tool-only 的回复不会触发无意义的 TTS 会话。
  private publishSpeechText(
    source: InboundMessage,
    content: string,
    speech: SpeechState
  ): void {
    if (!speech.enabled || !content) {
      return
    }

    if (!speech.started) {
      speech.started = true
      this.bus.publishInbound(
        new ConnectionStartMessage({
          channel: source.channel,
          chatId: source.chatId,
          senderId: 'agent',
          sendTo: 'tts-manager',
        })
      )
    }

    this.bus.publishInbound(
      new InboundMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        sendTo: 'tts-manager',
        type: 'text',
        content,
      })
    )
  }

  // 发送 TTS 结束信号。即使本轮没有真正 start TTS 也可以安全发送，
  // TTSManager 会忽略没有活跃实例的会话。
  private finishSpeech(source: InboundMessage): void {
    this.bus.publishInbound(
      new ConnectionEndMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        sendTo: 'tts-manager',
      })
    )
  }

  // response_start / response_end 是控制信号，不属于展示消息。
  // 桌面端根据这两个信号切换 isPlaying 状态，不把信号写入消息列表。
  private publishResponseLifecycle(
    source: InboundMessage,
    type: 'response_start' | 'response_end'
  ): void {
    this.bus.publishOutbound(
      new OutboundMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        type,
        content: '',
        timestamp: Date.now(),
      })
    )
  }

  private publishError(source: InboundMessage, content: string): void {
    this.bus.publishOutbound(
      new OutboundMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        type: 'error',
        content,
      })
    )
  }
}
