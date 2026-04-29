import fs from 'fs'
import path from 'path'
import {
  buildSection,
  normalizeText,
  renderBulletList,
  renderKeyValueLine,
  renderParagraphs,
  resolveWorkspacePath,
} from '@tina-chris/tina-util'
import { SkillLoader } from './skills'

import type { MemoryStore } from '@/memory'
import type { AgentConfig } from '@/config'

export const REQUIRED_PROMPT_FILES = ['USER.md', 'AGENT.md', 'SOUL.md'] as const
const BOOTSTRAP_FILES = ['AGENT.md', 'SOUL.md', 'USER.md', 'TOOLS.md'] as const

export const getMissingPromptFiles = (workspacePath: string): string[] => {
  return REQUIRED_PROMPT_FILES.filter((filename) => {
    const filePath = path.join(workspacePath, filename)
    return !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()
  })
}

// TODO: 具体提示词内容可以再优化
// 导出的工具函数用于前端构建时使用，确保用户配置的引导文件能够正确生成系统提示词并同步到工作空间目录中
export const buildUserPromptDocument = (agentConfig: AgentConfig): string => {
  const { userProfile } = agentConfig

  const sections = [
    '# User Profile',
    '',
    buildSection(
      '## Basic Information',
      [
        renderKeyValueLine('Name', userProfile.name),
        renderKeyValueLine('Timezone', userProfile.timezone),
        renderKeyValueLine('Language', userProfile.language),
      ].join('\n')
    ),
    '',
    buildSection(
      '## Preferences',
      [
        renderKeyValueLine(
          'Communication Style',
          userProfile.communicationStyle
        ),
        renderKeyValueLine('Response Length', userProfile.responseLength),
        renderKeyValueLine('Technical Level', userProfile.technicalLevel),
      ].join('\n')
    ),
    '',
    buildSection(
      '## Work Context',
      renderKeyValueLine('Primary Role', userProfile.primaryRole)
    ),
    '',
    buildSection(
      '## Interests and Hobbies',
      renderBulletList(userProfile.interestsAndHobbies)
    ),
    '',
    buildSection(
      '## Personal Habits',
      renderBulletList(userProfile.personalHabits)
    ),
    '',
    buildSection(
      '## Special Instructions',
      renderParagraphs(userProfile.specialInstructions)
    ),
  ]

  return `${sections.join('\n').trim()}\n`
}

export const buildAgentPromptDocument = (agentConfig: AgentConfig): string => {
  const { agentPrompt } = agentConfig

  const sections = [
    '# Agent Instructions',
    '',
    normalizeText(agentPrompt.identity),
    '',
    buildSection('## Guidelines', renderBulletList(agentPrompt.guidelines)),
    '',
    buildSection(
      '## Additional Instructions',
      renderParagraphs(agentPrompt.additionalInstructions)
    ),
  ]

  return `${sections.join('\n').trim()}\n`
}

export const buildSoulPromptDocument = (agentConfig: AgentConfig): string => {
  const { soulPrompt } = agentConfig

  const sections = [
    '# Soul',
    '',
    normalizeText(soulPrompt.identity),
    '',
    buildSection(
      '## Personality',
      renderBulletList(soulPrompt.personalityTraits)
    ),
    '',
    buildSection('## Values', renderBulletList(soulPrompt.coreValues)),
    '',
    buildSection(
      '## Communication Style',
      renderBulletList(soulPrompt.communicationStyle)
    ),
    '',
    buildSection(
      '## Additional Notes',
      renderParagraphs(soulPrompt.additionalNotes)
    ),
  ]

  return `${sections.join('\n').trim()}\n`
}

export const syncWorkspacePromptFiles = (
  agentConfig: AgentConfig
): { workspacePath: string } => {
  const workspacePath = resolveWorkspacePath(agentConfig.workspace)
  // 确保工作空间目录存在，并将用户配置的引导内容写入对应的文件中，覆盖原有内容
  fs.mkdirSync(workspacePath, { recursive: true })
  fs.writeFileSync(
    path.join(workspacePath, 'USER.md'),
    buildUserPromptDocument(agentConfig),
    'utf-8'
  )
  fs.writeFileSync(
    path.join(workspacePath, 'AGENT.md'),
    buildAgentPromptDocument(agentConfig),
    'utf-8'
  )
  fs.writeFileSync(
    path.join(workspacePath, 'SOUL.md'),
    buildSoulPromptDocument(agentConfig),
    'utf-8'
  )

  return { workspacePath }
}

export class ContextBuilder {
  private systemPrompt: string

  constructor(
    private workspacePath: string,
    private memoryStore: MemoryStore,
    private skills: SkillLoader
  ) {
    // 检查提示词文件是否存在，如果缺失则抛出错误，确保系统提示词能够正确构建
    getMissingPromptFiles(workspacePath).forEach((filename) => {
      throw new Error(
        `Missing required prompt file: ${filename} in workspace: ${workspacePath}`
      )
    })
    // 初始化 skills 加载器和系统提示词
    this.systemPrompt = this.buildSystemPrompt()
  }

  buildMessages(
    history: Array<Record<string, any>>,
    currentMessage: string,
    options: {
      // 用于读取指定会话的记忆上下文
      sessionKey: string
      // 额外添加提示词
      extraSystemPrompt?: string
    }
  ): Array<Record<string, any>> {
    // systemPrompt 是初始化时构建的稳定部分，memoryContext 是每轮动态读取的部分
    // 这样 Agent 保存记忆或摘要器更新会话摘要后，下一轮对话就能立即读到新内容
    const systemParts = [
      this.systemPrompt,
      // 记忆上下文放在系统提示词里，确保模型每轮都能看到最新的记忆内容，辅助回答和决策
      this.memoryStore.buildMemoryContext(options.sessionKey),
      options.extraSystemPrompt || '',
    ].filter((part) => part.trim().length > 0)

    return [
      {
        role: 'system',
        content: systemParts.join('\n\n---\n\n'),
      },
      ...history,
      {
        role: 'user',
        content: currentMessage,
      },
    ]
  }

  // 添加工具调用信息到上下文
  addAssistantMessage(
    messages: Array<Record<string, any>>,
    content: string,
    toolCalls?: Array<Record<string, any>>
  ): Array<Record<string, any>> {
    const message: Record<string, any> = {
      role: 'assistant',
      content,
    }

    if (toolCalls && toolCalls.length > 0) {
      message.tool_calls = toolCalls
    }

    messages.push(message)
    return messages
  }
  // 添加工具调用结果到上下文
  addToolResult(
    messages: Array<Record<string, any>>,
    toolCallId: string,
    toolName: string,
    result: string
  ): Array<Record<string, any>> {
    messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: result,
    })
    return messages
  }
  // 构建系统提示词，包含身份信息、引导原则、技能摘要等固定内容
  private buildSystemPrompt(): string {
    const parts = [
      this.buildIdentity(),
      this.loadBootstrapFiles(),
      this.buildSkillsContext(),
    ].filter((part) => part.trim().length > 0)

    return parts.join('\n\n---\n\n')
  }

  private buildIdentity(): string {
    const now = new Date().toLocaleString()
    // 固定的基本消息，不允许用户自定义，确保模型每次都能正确理解自己的身份和能力范围
    return [
      '# System Instructions',
      '',
      'You are a desktop AI assistant. You answer directly unless a tool is needed.',
      'You need to obey the settings and guidance provided by the user.',
      'You can read files inside the configured workspace, list workspace directories, search the web when configured, fetch web pages, manage memory through dedicated memory tools, spawn safe subagents for independent research tasks, and send messages back to the current chat.',
      '',
      '## Current Time',
      now,
      '',
      '## Workspace',
      this.workspacePath,
      '',
      '## Memory Paths',
      `Long-term memory: ${path.join(this.workspacePath, 'memory', 'MEMORY.md')}`,
      `Daily memory: ${path.join(this.workspacePath, 'memory', 'YYYY-MM-DD.md')}`,
      `Session summaries: ${path.join(this.workspacePath, 'memory', 'sessions')}`,
      '',
      'Important rules:',
      '- Use tools only when they help answer or complete the user request.',
      '- Use memory tools for durable facts, user preferences, project context, and useful daily notes.',
      '- Use readMemory when recalling a specific date, multiple dates, or the current session summary would help.',
      '- Use spawnSubagent only for independent work that can run in the background with safe read/search tools.',
      '- Never claim you changed files unless a write-capable tool exists and succeeded.',
      '- If required context is missing, explain what is missing clearly.',
    ].join('\n')
  }

  // 加载用户自定义的引导文件，构建成系统提示词的一部分
  private loadBootstrapFiles(): string {
    const parts: string[] = []
    // 配置时已经按照格式配置好了引导文件内容，这里直接读取即可，不需要再进行额外的格式化处理
    for (const filename of BOOTSTRAP_FILES) {
      const filePath = path.join(this.workspacePath, filename)
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        continue
      }

      const content = fs.readFileSync(filePath, 'utf-8').trim()
      if (content) {
        parts.push(`## ${filename}\n\n${content}`)
      }
    }

    return parts.join('\n\n')
  }

  // 构建 skill 相关的系统提示词内容，包括始终可用技能和技能摘要
  private buildSkillsContext(): string {
    const alwaysSkills = this.skills.getAlwaysSkills()
    const alwaysContent = this.skills.loadSkillsForContext(alwaysSkills)
    const summary = this.skills.buildSkillsSummary()
    const parts: string[] = []

    if (alwaysContent) {
      parts.push(`# Active Skills\n\n${alwaysContent}`)
    }

    if (summary) {
      parts.push(
        [
          '# Skills',
          '',
          'The following workspace skills extend your capabilities. To use a skill, read its SKILL.md file with the read_file tool.',
          'Skills marked unavailable may need local commands or environment variables before they can be used.',
          '',
          summary,
        ].join('\n')
      )
    }

    return parts.join('\n\n')
  }
}
