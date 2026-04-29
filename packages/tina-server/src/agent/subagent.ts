import { randomUUID } from 'crypto'
import { InboundMessage, MessageBus } from '@tina-chris/tina-bus'
import { logger } from '@tina-chris/tina-util'

import type { Config } from '@/config'
import type { LLMManager } from '@/llm'
import type { MemoryStore } from '@/memory'

import { createSubagentToolRegistry } from '@/tool'

// subagent 是后台辅助执行单元，不应该无限制扩散。
// 并发限制避免一个主 Agent 同时派出过多任务，占满 LLM 请求或让用户失去控制感。
const MAX_RUNNING_SUBAGENTS = 2
// 子代理只做安全信息收集和分析，轮数过多通常意味着任务过大或模型陷入工具循环。
const MAX_SUBAGENT_TOOL_ROUNDS = 8

export type SpawnSubagentInput = {
  task: string
  label?: string
  originChannel: string
  originChatId: string
  originSessionKey: string
}

type SubagentManagerOptions = {
  config: Config
  llm: LLMManager
  bus: MessageBus
  workspacePath: string
  memoryStore: MemoryStore
}

export class SubagentManager {
  // runningTasks 只记录当前进程内的后台任务。
  // v0 不做跨进程恢复；应用重启后未完成的 subagent 任务会自然丢失。
  private runningTasks = new Map<string, Promise<void>>()

  constructor(private options: SubagentManagerOptions) {}

  async spawn({
    task,
    label,
    originChannel,
    originChatId,
    originSessionKey,
  }: SpawnSubagentInput): Promise<string> {
    if (this.runningTasks.size >= MAX_RUNNING_SUBAGENTS) {
      return `Error: Too many subagents are already running. Maximum is ${MAX_RUNNING_SUBAGENTS}.`
    }

    const taskId = randomUUID().slice(0, 8)
    const displayLabel = label || this.createLabel(task)
    // 不 await runSubagent，保证 spawnSubagent 工具可以立刻把“已启动”结果返回给主 Agent。
    // 后台任务完成后会通过消息总线再注入一条 subagent result。
    const run = this.runSubagent({
      taskId,
      task,
      label: displayLabel,
      originChannel,
      originChatId,
      originSessionKey,
    }).finally(() => {
      this.runningTasks.delete(taskId)
    })

    this.runningTasks.set(taskId, run)
    run.catch((error) => {
      // runSubagent 内部会把失败结果发布回主 Agent；这里额外兜底记录未预期异常。
      logger.error(`[SubagentManager] background task failed: ${error}`)
    })

    return `Subagent '${displayLabel}' started (id: ${taskId}). I will report back when it completes.`
  }

  private async runSubagent({
    taskId,
    task,
    label,
    originChannel,
    originChatId,
    originSessionKey,
  }: {
    taskId: string
    task: string
    label: string
    originChannel: string
    originChatId: string
    originSessionKey: string
  }): Promise<void> {
    try {
      // 子代理使用独立 ToolRegistry，避免继承主 Agent 的 message/spawn 等高影响工具。
      // createSubagentToolRegistry 只注册 read/list/web/readMemory 这类安全工具。
      const registry = createSubagentToolRegistry({
        config: this.options.config,
        workspacePath: this.options.workspacePath,
        memoryStore: this.options.memoryStore,
        sessionKey: originSessionKey,
      })
      const messages: Array<Record<string, any>> = [
        {
          role: 'system',
          content: this.buildPrompt(task),
        },
        {
          role: 'user',
          content: task,
        },
      ]

      let finalResult = ''
      for (let round = 0; round < MAX_SUBAGENT_TOOL_ROUNDS; round += 1) {
        // 子代理始终使用非流式调用，因为它不直接面向用户展示增量内容。
        const response = await this.options.llm.chat({
          messages,
          tools: registry.getDefinitions(),
          model: this.options.config.agent.model || undefined,
          maxTokens: this.options.config.agent.maxTokens,
          temperature: this.options.config.agent.temperature,
          stream: false,
        })

        if (response.finishReason === 'error') {
          finalResult = response.content || 'Subagent LLM call failed.'
          break
        }

        if (!response.hasToolCalls()) {
          // 没有工具调用时说明子代理已经给出最终结论，可以结束后台任务。
          finalResult = response.content
          break
        }

        messages.push({
          // OpenAI-compatible tool calling 需要把 assistant 的 tool_calls 原样写回上下文，
          // 下一轮模型才能把工具结果和之前的调用对应起来。
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args),
            },
          })),
        })

        for (const toolCall of response.toolCalls) {
          // ToolRegistry 会捕获工具执行异常并转成字符串结果，子代理继续把结果交回模型判断。
          const result = await registry.execute(toolCall.name, toolCall.args)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: result,
          })
        }
      }

      if (!finalResult) {
        // 达到轮数上限时也必须给主 Agent 一个明确结果，避免用户只看到“任务启动”却没有后续。
        finalResult =
          'The subagent reached its tool interaction limit without a final response.'
      }

      this.announceResult({
        taskId,
        task,
        label,
        result: finalResult,
        status: 'ok',
        originChannel,
        originChatId,
        originSessionKey,
      })
    } catch (error) {
      // 任何未被工具层捕获的异常，都作为失败结果交回主 Agent，而不是直接丢在后台。
      const message = error instanceof Error ? error.message : String(error)
      this.announceResult({
        taskId,
        task,
        label,
        result: `Error: ${message}`,
        status: 'error',
        originChannel,
        originChatId,
        originSessionKey,
      })
    }
  }

  private announceResult({
    taskId,
    task,
    label,
    result,
    status,
    originChannel,
    originChatId,
    originSessionKey,
  }: {
    taskId: string
    task: string
    label: string
    result: string
    status: 'ok' | 'error'
    originChannel: string
    originChatId: string
    originSessionKey: string
  }): void {
    const statusText = status === 'ok' ? 'completed' : 'failed'
    // subagent 不直接 publishOutbound 给用户。
    // 它把原始结果作为 sendTo='agent' 的入站消息交回主 Agent，由主 Agent结合原会话语境整理成自然回复。
    this.options.bus.publishInbound(
      new InboundMessage({
        channel: originChannel,
        chatId: originChatId,
        senderId: 'subagent',
        sendTo: 'agent',
        type: 'text',
        content: [
          `[Subagent '${label}' ${statusText}]`,
          '',
          `Task: ${task}`,
          '',
          'Result:',
          result,
          '',
          'Summarize this naturally for the user. Keep it brief and useful.',
        ].join('\n'),
        metadata: {
          // AgentLoop 通过这个标记识别“子代理回报”消息，并在汇报阶段禁用工具和 TTS。
          subagentResult: true,
          taskId,
          label,
          status,
          originSessionKey,
        },
      })
    )
  }

  private buildPrompt(task: string): string {
    // 子代理 prompt 明确能力边界，避免模型误以为自己可以写文件、发消息或继续派生子代理。
    return [
      '# Safe Subagent',
      '',
      'You are a background subagent spawned by the main desktop assistant.',
      'Complete only the assigned task and return a concise final result.',
      '',
      '## Task',
      task,
      '',
      '## Tools',
      '- You may read files inside the workspace, list directories, fetch web pages, search the web when configured, and read memory.',
      '- You cannot write files, execute shell commands, send messages to the user, or spawn other subagents.',
      '',
      '## Workspace',
      this.options.workspacePath,
    ].join('\n')
  }

  private createLabel(task: string): string {
    return task.length > 30 ? `${task.slice(0, 30)}...` : task
  }
}
