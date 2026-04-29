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
import { DESKTOP_SPEECH_PROMPT } from './prompt'
import {
  type SpeakTagStreamEvent,
  SpeakTagStreamParser,
} from './speakTagParser'
import { SubagentManager } from './subagent'
import { SkillLoader } from './skills'

import type { Config } from '@/config'
import type { Session } from '@/session'

import { LLMManager } from '@/llm'
import { MemoryStore, SessionMemorySummarizer } from '@/memory'
import { SessionManager } from '@/session'
import {
  MessageTool,
  ReadMemoryTool,
  SpawnSubagentTool,
  ToolRegistry,
  createDefaultToolRegistry,
} from '@/tool'

type AgentLoopRuntime = {
  workspacePath: string
  sessionManager: SessionManager
  contextBuilder: ContextBuilder
  toolRegistry: ToolRegistry
  memorySummarizer: SessionMemorySummarizer
}

export class AgentLoop {
  private runtime: AgentLoopRuntime | null = null
  private initializationError: string | null = null

  constructor(
    private config: Config,
    private bus: MessageBus,
    private llm: LLMManager
  ) {
    this.initialize()

    this.bus.subscribeInbound('agent', async (message) => {
      await this.processInboundMessage(message)
    })
  }
  // 初始化函数负责设置 AgentLoop 的运行时环境，包括验证工作区所需的提示文件是否存在
  // 并根据配置创建 SessionManager 和 ContextBuilder 实例
  // 如果验证失败或发生错误，会将初始化错误信息保存到 this.initializationError 中，以便后续处理消息时使用
  // 当配置更新时，AgentLoop 会重新调用 initialize() 来刷新运行时环境，确保新的配置生效
  initialize(): void {
    this.runtime = null
    this.initializationError = null

    try {
      // 统一验证工作区是否存在
      const workspacePath = resolveWorkspacePath(this.config.agent.workspace)

      // 记忆、上下文构建器、工具注册表必须共用同一个 workspacePath。
      // 这样记忆工具写入的内容，下一轮 ContextBuilder 注入上下文时能从同一处读回。
      const memoryStore = new MemoryStore(workspacePath)
      const skills = new SkillLoader(workspacePath)
      const subagentManager = new SubagentManager({
        config: this.config,
        llm: this.llm,
        bus: this.bus,
        workspacePath,
        memoryStore,
      })

      // runtime 是 AgentLoop 当前配置的一次性快照。
      // 当用户修改 Agent 配置后，initialize() 会重新创建这些对象，避免旧工具继续持有过期配置。
      this.runtime = {
        workspacePath,
        sessionManager: new SessionManager(workspacePath),
        contextBuilder: new ContextBuilder(workspacePath, memoryStore, skills),
        toolRegistry: createDefaultToolRegistry({
          config: this.config,
          workspacePath,
          bus: this.bus,
          memoryStore,
          subagentManager,
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

  private async processInboundMessage(message: InboundMessage): Promise<void> {
    // 目前 AgentLoop 只处理文本消息，其他类型的消息会被忽略。
    // TODO: 后续支持多模态后可以根据需要增加对其他类型消息的处理，例如图片等。
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

  private async processTextMessage(
    message: InboundMessage,
    content: string
  ): Promise<void> {
    const runtime = this.getRuntime()
    if (!runtime) {
      this.publishError(
        message,
        this.initializationError || 'Agent is not ready.'
      )
      return
    }

    // 获取会话上下文
    const session = runtime.sessionManager.getOrCreate(message.sessionKey)

    // 工具实例会在 runtime 生命周期内复用；这里按“当前入站消息”刷新运行时上下文。
    // message 工具需要知道发回哪个 channel/chatId，memory 和 subagent 需要知道当前 sessionKey。
    const messageTool = runtime.toolRegistry.get('message')
    if (messageTool instanceof MessageTool) {
      messageTool.setContext(message.channel, message.chatId)
    }
    const readMemoryTool = runtime.toolRegistry.get('readMemory')
    if (readMemoryTool instanceof ReadMemoryTool) {
      readMemoryTool.setContext(message.sessionKey)
    }
    const spawnSubagentTool = runtime.toolRegistry.get('spawnSubagent')
    if (spawnSubagentTool instanceof SpawnSubagentTool) {
      spawnSubagentTool.setContext(
        message.channel,
        message.chatId,
        message.sessionKey
      )
    }

    const isSubagentResult = this.isSubagentResultMessage(message)
    // subagent 完成后的回报只需要主 Agent 整理成自然语言。
    // 这里不再开放工具调用，避免“汇报结果”阶段继续读取文件、继续搜索或再次派生任务。
    const tools = isSubagentResult ? [] : runtime.toolRegistry.getDefinitions()
    // 针对桌面端采用流式输出和支持语音输入。
    // 子代理回报是系统内部消息，禁用流式和 TTS 可以避免后台结果突然触发语音播报。
    const shouldStream = message.channel === 'desktop' && !isSubagentResult
    // 流式且启用 TTS 时才使用说话标签解析器，增量处理语音事件；其他情况直接当作普通文本处理。
    const shouldUseSpeech = shouldStream && Boolean(this.config.tts.current)
    const speechParser = shouldUseSpeech ? new SpeakTagStreamParser() : null
    let messages = runtime.contextBuilder.buildMessages(
      session.getHistory(),
      content,
      {
        sessionKey: message.sessionKey,
        // 附加上语音输出使用的提示词
        extraSystemPrompt: shouldUseSpeech ? DESKTOP_SPEECH_PROMPT : '',
      }
    )
    const streamId = randomUUID()
    let finalContent = ''
    let assistantVisibleContent = ''
    let toolRounds = 0
    const maxToolRounds = Math.max(0, this.config.agent.maxToolInteractions)
    // 处理发送输出的结果
    const emitAssistantText = (text: string) => {
      if (!text) {
        return
      }

      const events = speechParser
        ? speechParser.process(text)
        : ([{ type: 'visible', text }] as SpeakTagStreamEvent[])

      for (const event of events) {
        this.handleSpeakEvent(message, streamId, event)
        if (event.type === 'visible' && event.text) {
          assistantVisibleContent += event.text
        }
      }
    }

    const finishSpeech = () => {
      if (!speechParser) {
        return
      }
      // 结束语音流，处理剩余事件
      for (const event of speechParser.finish()) {
        this.handleSpeakEvent(message, streamId, event)
        if (event.type === 'visible' && event.text) {
          // 记录流式输出文本
          assistantVisibleContent += event.text
        }
      }
    }

    while (true) {
      let responseStreamed = false
      const response = await this.llm.chat({
        messages,
        tools,
        model: this.config.agent.model || undefined,
        maxTokens: this.config.agent.maxTokens,
        temperature: this.config.agent.temperature,
        stream: shouldStream,
        streamId,
        // 只有在流式输出且启用语音的情况下才使用 onChunk 回调来处理增量文本和 speak 标签事件
        onChunk: shouldStream
          ? (chunk) => {
              if (!chunk.delta) {
                return
              }

              responseStreamed = true
              emitAssistantText(chunk.delta)
            }
          : undefined,
      })

      if (response.finishReason === 'error') {
        this.publishError(message, response.content || 'LLM call failed.')
        return
      }
      // 如果 LLM 没有调用工具，就不需要继续循环了，直接输出结果并结束
      if (!response.hasToolCalls()) {
        if (!responseStreamed && response.content) {
          emitAssistantText(response.content)
        }
        finishSpeech()
        finalContent = assistantVisibleContent || response.content
        break
      }

      if (toolRounds >= maxToolRounds) {
        finalContent =
          'Agent stopped because the configured tool interaction limit was reached.'
        emitAssistantText(finalContent)
        finishSpeech()
        break
      }

      toolRounds += 1
      // 处理工具调用结果，构建新的上下文继续循环
      // 这里的 messages 是完整的对话历史加上当前轮的助手消息和工具调用结果，
      // TODO: 后续前端要展示工具调用结果的话在这里进行修改
      const toolCallMessages = response.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.args),
        },
      }))

      messages = runtime.contextBuilder.addAssistantMessage(
        messages,
        response.content,
        toolCallMessages
      )

      for (const toolCall of response.toolCalls) {
        const result = await runtime.toolRegistry.execute(
          toolCall.name,
          toolCall.args
        )
        messages = runtime.contextBuilder.addToolResult(
          messages,
          toolCall.id,
          toolCall.name,
          result
        )
      }
    }
    // 如果最终没有任何内容可以输出，给出一个默认提示，避免用户等待没有反馈
    if (!finalContent) {
      finalContent =
        'I completed processing, but no final response was generated.'
      emitAssistantText(finalContent)
      finishSpeech()
    }

    // 保存会话记录后再异步调度摘要。
    // 摘要器需要看到本轮 user/assistant 的最终内容，但摘要失败不应该影响当前回复。
    session.addMessage('user', content)
    session.addMessage('assistant', finalContent)
    runtime.sessionManager.save(session)
    this.scheduleSessionSummary(runtime, session)
  }

  private getRuntime(): AgentLoopRuntime | null {
    return this.runtime
  }

  private isSubagentResultMessage(message: InboundMessage): boolean {
    // SubagentManager 会把结果以 sendTo='agent' 的入站消息投回来，
    // metadata.subagentResult 是主循环区分“用户消息”和“后台结果汇报”的唯一标记。
    return (
      message.senderId === 'subagent' &&
      message.metadata.subagentResult === true
    )
  }

  private scheduleSessionSummary(
    runtime: AgentLoopRuntime,
    session: Session
  ): void {
    // 摘要更新是后台增强流程：
    // 不 await 可以让用户先拿到当前回复；完成后再保存 session metadata 中的摘要进度。
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

  // handleSpeakEvent 负责处理从 LLM 响应中解析出的 speak 标签事件，
  // 根据事件类型（visible、speakStart、speakText、speakEnd）发布相应的消息到消息总线
  private handleSpeakEvent(
    source: InboundMessage,
    streamId: string,
    event: SpeakTagStreamEvent
  ): void {
    // visible 事件直接将文本作为普通消息发布，
    // speakStart/speakText/speakEnd 事件则转换成特定格式的消息供 TTSManager 处理
    if (event.type === 'visible') {
      this.publishText(source, event.text, streamId)
      return
    }

    if (event.type === 'speakStart') {
      this.bus.publishInbound(
        new ConnectionStartMessage({
          channel: source.channel,
          chatId: source.chatId,
          senderId: 'agent',
          sendTo: 'tts-manager',
        })
      )
      return
    }

    if (event.type === 'speakText') {
      this.bus.publishInbound(
        new InboundMessage({
          channel: source.channel,
          chatId: source.chatId,
          senderId: 'agent',
          sendTo: 'tts-manager',
          type: 'text',
          content: event.text,
        })
      )
      return
    }

    this.bus.publishInbound(
      new ConnectionEndMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        sendTo: 'tts-manager',
      })
    )
  }

  private publishText(
    source: InboundMessage,
    content: string,
    streamId: string
  ): void {
    this.bus.publishOutbound(
      new OutboundMessage({
        channel: source.channel,
        chatId: source.chatId,
        senderId: 'agent',
        type: 'text',
        content,
        metadata: {
          id: streamId,
        },
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
