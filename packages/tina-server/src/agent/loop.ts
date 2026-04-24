import { randomUUID } from 'crypto'
import {
  ConnectionEndMessage,
  ConnectionStartMessage,
  InboundMessage,
  MessageBus,
  OutboundMessage,
} from '@tina-chris/tina-bus'
import { logger } from '@tina-chris/tina-util'
import { ContextBuilder, validateWorkspacePromptFiles } from './context'
import {
  type SpeakTagStreamEvent,
  SpeakTagStreamParser,
} from './speakTagParser'

import type { Config } from '@/config'

import { LLMManager } from '@/llm'
import { SessionManager } from '@/session'
import { MessageTool, ToolRegistry, createDefaultToolRegistry } from '@/tool'

type AgentLoopRuntime = {
  workspacePath: string
  sessionManager: SessionManager
  contextBuilder: ContextBuilder
  toolRegistry: ToolRegistry
}

// 这个移到 context 模块
const DESKTOP_SPEECH_PROMPT = [
  '## Desktop Voice Output',
  'When you want the desktop assistant to speak aloud, wrap only the spoken text in <speak>...</speak>.',
  'Text inside <speak> is also shown in chat; the tags themselves are hidden by the desktop renderer.',
  'For basic daily conversation, produce short <speak> content quickly so the user does not wait for voice feedback.',
  'Before long-running tasks such as searching, analyzing large context, or using tools for a while, briefly speak a status update telling the user to wait.',
  'Do not wrap code blocks, long lists, URLs, tool arguments, or private reasoning in <speak>.',
].join('\n')

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
      // 验证工作区所需的提示文件是否存在，并获取工作区路径。如果缺少文件，记录错误信息并返回。
      const { workspacePath, missingFiles } = validateWorkspacePromptFiles(
        this.config.agent
      )

      if (missingFiles.length > 0) {
        this.initializationError = `Agent workspace is missing required prompt files: ${missingFiles.join(
          ', '
        )}. Please save Agent configuration first.`
        return
      }

      this.runtime = {
        workspacePath,
        sessionManager: new SessionManager(workspacePath),
        contextBuilder: new ContextBuilder(workspacePath),
        toolRegistry: createDefaultToolRegistry({
          config: this.config,
          workspacePath,
          bus: this.bus,
        }),
      }
    } catch {
      this.initializationError =
        'Agent workspace is not configured. Please set workspace in Agent settings and save prompt files first.'
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
    // 获取已注册的工具信息
    const tools = runtime.toolRegistry.getDefinitions()
    // 重置消息工具上下文
    const messageTool = runtime.toolRegistry.get('message')
    if (messageTool instanceof MessageTool) {
      messageTool.setContext(message.channel, message.chatId)
    }
    // 针对桌面端采用流式输出和支持语音输入
    const shouldStream = message.channel === 'desktop'
    const shouldUseSpeech = shouldStream && Boolean(this.config.tts.current)
    const speechParser = shouldUseSpeech ? new SpeakTagStreamParser() : null
    let messages = runtime.contextBuilder.buildMessages(
      session.getHistory(),
      content,
      // 附加上语音输出使用的提示词
      shouldUseSpeech ? DESKTOP_SPEECH_PROMPT : ''
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

    // 保存会话记录
    session.addMessage('user', content)
    session.addMessage('assistant', finalContent)
    runtime.sessionManager.save(session)
  }

  private getRuntime(): AgentLoopRuntime | null {
    return this.runtime
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
