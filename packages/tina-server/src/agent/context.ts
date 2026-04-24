import fs from 'fs'
import path from 'path'
import { expandHomePath } from '@tina-chris/tina-util'
import { SkillLoader } from './skills'

import type { AgentConfig } from '@/config'

export const REQUIRED_PROMPT_FILES = ['USER.md', 'AGENT.md', 'SOUL.md'] as const
const BOOTSTRAP_FILES = ['AGENT.md', 'SOUL.md', 'USER.md', 'TOOLS.md'] as const

// 导出的工具函数用于前端构建时使用，确保用户配置的引导文件能够正确生成系统提示词并同步到工作空间目录中
const splitLines = (value: string): string[] => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const normalizeText = (value: string): string => {
  return value.trim()
}

const renderBulletList = (value: string): string => {
  const items = splitLines(value)
  if (items.length === 0) {
    return ''
  }

  return items.map((item) => `- ${item}`).join('\n')
}

const renderParagraphs = (value: string): string => {
  const paragraphs = value
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  return paragraphs.join('\n\n')
}

const renderKeyValueLine = (label: string, value: string): string => {
  return `- **${label}**: ${normalizeText(value)}`
}

const buildSection = (title: string, content: string): string => {
  const normalizedContent = content.trim()
  return normalizedContent ? `${title}\n\n${normalizedContent}` : title
}

export const resolveWorkspacePath = (workspace: string): string => {
  const normalizedWorkspace = workspace.trim()
  if (!normalizedWorkspace) {
    throw new Error('Agent workspace is required.')
  }

  return path.resolve(expandHomePath(normalizedWorkspace))
}

export const getMissingPromptFiles = (workspacePath: string): string[] => {
  return REQUIRED_PROMPT_FILES.filter((filename) => {
    const filePath = path.join(workspacePath, filename)
    return !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()
  })
}

// TODO: 具体提示词内容可以再优化
export const validateWorkspacePromptFiles = (
  agentConfig: AgentConfig
): { workspacePath: string; missingFiles: string[] } => {
  const workspacePath = resolveWorkspacePath(agentConfig.workspace)
  return {
    workspacePath,
    missingFiles: getMissingPromptFiles(workspacePath),
  }
}

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
  private skills: SkillLoader
  private systemPrompt: string

  constructor(private workspacePath: string) {
    // 初始化 skills 加载器和系统提示词
    this.skills = new SkillLoader(workspacePath)
    this.systemPrompt = this.buildSystemPrompt()
  }

  buildMessages(
    history: Array<Record<string, any>>,
    currentMessage: string,
    extraSystemPrompt = ''
  ): Array<Record<string, any>> {
    const systemPrompt = extraSystemPrompt.trim()
      ? `${this.systemPrompt}\n\n---\n\n${extraSystemPrompt.trim()}`
      : this.systemPrompt

    return [
      {
        role: 'system',
        content: systemPrompt,
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
      'You can read files inside the configured workspace, list workspace directories, search the web when configured, fetch web pages, and send messages back to the current chat.',
      '',
      '## Current Time',
      now,
      '',
      '## Workspace',
      this.workspacePath,
      '',
      'Important rules:',
      '- Use tools only when they help answer or complete the user request.',
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
