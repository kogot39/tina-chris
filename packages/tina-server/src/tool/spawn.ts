import { Tool, type ToolParameters } from './base'

import type { SubagentManager } from '@/agent/subagent'

export class SpawnSubagentTool extends Tool {
  // 工具实例是随着 AgentLoop runtime 创建并复用的，
  // 因此当前对话的 channel/chatId/sessionKey 需要在每轮处理消息前由 AgentLoop 写入。
  private channel = ''
  private chatId = ''
  private sessionKey = ''

  constructor(private manager: SubagentManager) {
    super()
  }

  setContext(channel: string, chatId: string, sessionKey: string): void {
    // 记录来源上下文，方便 subagent 完成后把结果回投到正确的主会话。
    this.channel = channel
    this.chatId = chatId
    this.sessionKey = sessionKey
  }

  get name(): string {
    return 'spawnSubagent'
  }

  get description(): string {
    return [
      'Spawn a safe background subagent for an independent research or analysis task.',
      'Use this when the task can run separately while the main agent continues.',
      'The subagent reports back through the main agent when it completes.',
    ].join(' ')
  }

  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The focused task for the subagent to complete.',
        },
        label: {
          type: 'string',
          description: 'Optional short label for the task.',
        },
      },
      required: ['task'],
    }
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    // spawnSubagent 只负责启动后台任务，不等待任务完成。
    // 实际执行、并发限制和结果回报都由 SubagentManager 统一处理。
    const task = typeof params.task === 'string' ? params.task.trim() : ''
    const label = typeof params.label === 'string' ? params.label.trim() : ''
    if (!task) {
      return 'Error: task is required.'
    }

    return this.manager.spawn({
      task,
      label: label || undefined,
      originChannel: this.channel,
      originChatId: this.chatId,
      originSessionKey: this.sessionKey,
    })
  }
}
