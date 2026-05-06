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

import type { Context, Message, Tool } from '@mariozechner/pi-ai'

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
  // Agent 配置表单保存后会同步生成这三份 Markdown。
  // 后续 ContextBuilder 只读取文件，避免运行时上下文构建再依赖前端表单结构。
  const workspacePath = resolveWorkspacePath(agentConfig.workspace)
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
    getMissingPromptFiles(workspacePath).forEach((filename) => {
      throw new Error(
        `Missing required prompt file: ${filename} in workspace: ${workspacePath}`
      )
    })
    this.systemPrompt = this.buildSystemPrompt()
  }

  buildContext(
    history: Message[],
    currentMessage: Message,
    options: {
      sessionKey: string
      tools: Tool[]
    }
  ): Context {
    // pi-ai Context 只需要 systemPrompt、messages、tools 三块。
    // systemPrompt 合并静态身份/技能和动态 memory 摘要；messages 由 session
    // 展示消息和最小 context metadata 重建，当前用户消息追加在最后。
    const systemParts = [
      this.systemPrompt,
      this.memoryStore.buildMemoryContext(options.sessionKey),
    ].filter((part) => part.trim().length > 0)

    return {
      systemPrompt: systemParts.join('\n\n---\n\n'),
      messages: [...history, currentMessage],
      tools: options.tools,
    }
  }

  private buildSystemPrompt(): string {
    // systemPrompt 在 ContextBuilder 初始化时构建一次。Agent 配置或 workspace
    // 更新后会重新 initialize AgentLoop，从而重新创建 ContextBuilder。
    const parts = [
      this.buildIdentity(),
      this.loadBootstrapFiles(),
      this.buildSkillsContext(),
    ].filter((part) => part.trim().length > 0)

    return parts.join('\n\n---\n\n')
  }

  private buildIdentity(): string {
    const now = new Date().toLocaleString()
    return [
      '# System Instructions',
      '',
      'You are a desktop AI assistant. You answer directly unless a tool is needed.',
      'You need to obey the settings and guidance provided by the user.',
      'You can read files inside the configured workspace, list workspace directories, search the web when configured, fetch web pages, manage long-term memory through dedicated memory tools, and send messages back to the current chat.',
      '',
      '## Current Time',
      now,
      '',
      '## Workspace',
      this.workspacePath,
      '',
      '## Memory Paths',
      `Long-term memory: ${path.join(this.workspacePath, 'memory', 'MEMORY.md')}`,
      `Session summaries: ${path.join(this.workspacePath, 'memory', 'sessions')}`,
      '',
      'Important rules:',
      '- Use tools only when they help answer or complete the user request.',
      '- Use the injected memory context as an index: it contains the long-term memory directory and current session summary, not full long-term memory bodies.',
      '- Use read_memory with a directory path when a long-term memory entry body would help.',
      '- Use update_memory to create, revise, rename, or remove precise long-term memory nodes.',
      '- Never claim you changed files unless a write-capable tool exists and succeeded.',
      '- If required context is missing, explain what is missing clearly.',
    ].join('\n')
  }

  private loadBootstrapFiles(): string {
    const parts: string[] = []
    for (const filename of BOOTSTRAP_FILES) {
      const filePath = path.join(this.workspacePath, filename)
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        continue
      }

      const content = fs.readFileSync(filePath, 'utf-8').trim()
      if (content) {
        // WORKSPACE 中的 TOOLS.md 仍允许用户补充业务说明，但真正工具 schema
        // 以 Context.tools 中的 pi-ai Tool 定义为准。
        parts.push(`## ${filename}\n\n${content}`)
      }
    }

    return parts.join('\n\n')
  }

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
