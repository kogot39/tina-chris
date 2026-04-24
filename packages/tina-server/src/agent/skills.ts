import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

type SkillMetadata = {
  name?: string
  description?: string
  always?: boolean
  metadata?: string
}

/**
 * metadata 字段承载的是 skill 的扩展运行时信息。
 *
 * 这里不引入完整 YAML 解析器，而是延续当前项目“frontmatter 只解析扁平字段”的策略：
 * - name / description / always 直接作为一层字段读取
 * - metadata 作为一个 JSON 字符串保存更复杂的结构
 *
 * 示例：
 * metadata: {"always":true,"requires":{"env":["BOCHA_API_KEY"],"bins":["git"]}}
 */
type SkillRuntimeMetadata = {
  always?: boolean
  requires?: {
    bins?: string[]
    env?: string[]
  }
}

type SkillInfo = {
  name: string
  path: string
  available: boolean
  description: string
  missingRequirements: string
}

const escapeXml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const parseBoolean = (value: string | undefined): boolean => {
  return value === 'true' || value === '1' || value === 'yes'
}

const commandExists = (command: string): boolean => {
  const checker = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(checker, [command], {
    stdio: 'ignore',
    shell: false,
  })

  return result.status === 0
}

export class SkillLoader {
  private skillsDir: string

  constructor(private workspacePath: string) {
    this.skillsDir = path.join(this.workspacePath, 'skills')
  }

  // 列出 workspace/skills 下所有可识别的 skill。
  // 这里返回的是“可供上下文层展示的摘要信息”，而不是完整 markdown 内容。
  // Agent 在构建上下文时会先看到摘要，只有需要时才继续读取具体 skill 文本。
  listSkills(): SkillInfo[] {
    if (!fs.existsSync(this.skillsDir)) {
      return []
    }

    return fs
      .readdirSync(this.skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.toSkillInfo(entry.name))
      .filter((skill): skill is SkillInfo => skill !== null)
  }

  /**
   * 读取某个 skill 的原始 markdown 内容。
   * Skill 的约定路径固定为：
   *   {workspace}/skills/{skill-name}/SKILL.md
   */
  loadSkill(name: string): string | null {
    const skillPath = path.join(this.skillsDir, name, 'SKILL.md')
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isFile()) {
      return null
    }

    return fs.readFileSync(skillPath, 'utf-8')
  }

  // 将指定 skill 的正文拼接成一段可直接注入 prompt 的上下文文本。
  // frontmatter 只用于元信息，不应该原样暴露给模型，因此会在这里移除。
  loadSkillsForContext(skillNames: string[]): string {
    const parts: string[] = []

    for (const name of skillNames) {
      const content = this.loadSkill(name)
      if (!content) {
        continue
      }

      parts.push(`### Skill: ${name}\n\n${this.stripFrontmatter(content)}`)
    }

    return parts.join('\n\n---\n\n')
  }

  // 构建一个轻量技能摘要，供 Agent 先了解当前 workspace 有哪些 skill 可用。
  // 这里刻意不直接内联所有 skill 正文，避免系统提示词体积过大。
  // 如果模型确实需要某个 skill 的完整说明，可以再通过 read_file 读取对应 SKILL.md。
  buildSkillsSummary(): string {
    const skills = this.listSkills()
    if (skills.length === 0) {
      return ''
    }

    const lines = ['<skills>']
    for (const skill of skills) {
      lines.push(`  <skill available="${String(skill.available)}">`)
      lines.push(`    <name>${escapeXml(skill.name)}</name>`)
      lines.push(
        `    <description>${escapeXml(skill.description)}</description>`
      )
      lines.push(`    <location>${escapeXml(skill.path)}</location>`)
      if (!skill.available && skill.missingRequirements) {
        lines.push(
          `    <requires>${escapeXml(skill.missingRequirements)}</requires>`
        )
      }
      lines.push('  </skill>')
    }
    lines.push('</skills>')

    return lines.join('\n')
  }

  /**
   * 返回需要“总是自动注入”的 skill 名称列表。
   *
   * 支持两种写法：
   * 1. 顶层 frontmatter: always: true
   * 2. metadata JSON 中: {"always": true}
   *
   * 只有在 requirements 满足时，skill 才会进入 always 列表。
   */
  getAlwaysSkills(): string[] {
    return this.listSkills()
      .filter((skill) => {
        if (!skill.available) {
          return false
        }

        const metadata = this.getSkillMetadata(skill.name)
        const runtimeMetadata = this.parseSkillRuntimeMetadata(
          metadata?.metadata
        )
        return metadata?.always === true || runtimeMetadata.always === true
      })
      .map((skill) => skill.name)
  }

  // 将磁盘上的 skill 目录转换成可展示的摘要对象。
  // 这里会顺带完成 requirements 检查，以便前端/上下文层区分“存在但当前不可用”的 skill。
  private toSkillInfo(name: string): SkillInfo | null {
    const skillPath = path.join(this.skillsDir, name, 'SKILL.md')
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isFile()) {
      return null
    }

    const metadata = this.getSkillMetadata(name)
    const runtimeMetadata = this.parseSkillRuntimeMetadata(metadata?.metadata)
    const missingRequirements = this.getMissingRequirements(runtimeMetadata)

    return {
      name,
      path: skillPath,
      available: missingRequirements.length === 0,
      description: metadata?.description || name,
      missingRequirements: missingRequirements.join(', '),
    }
  }

  /**
   * 读取 SKILL.md 顶部 frontmatter 中的扁平字段。
   *
   * 当前实现是“够用就好”的轻量解析器，不依赖 YAML 库：
   * - 每行按第一个冒号切分
   * - 适合解析 name / description / always / metadata
   * - 更复杂的嵌套结构统一放进 metadata JSON 字符串里
   */
  private getSkillMetadata(name: string): SkillMetadata | null {
    const content = this.loadSkill(name)
    if (!content?.startsWith('---')) {
      return null
    }

    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!match) {
      return null
    }

    const metadata: SkillMetadata = {}
    for (const line of match[1].split(/\r?\n/)) {
      const index = line.indexOf(':')
      if (index < 0) {
        continue
      }

      const key = line.slice(0, index).trim() as keyof SkillMetadata
      const rawValue = line
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')

      if (key === 'always') {
        metadata.always = parseBoolean(rawValue)
      } else if (
        key === 'name' ||
        key === 'description' ||
        key === 'metadata'
      ) {
        metadata[key] = rawValue
      }
    }

    return metadata
  }

  /**
   * 解析 frontmatter 里的 metadata JSON 字符串。
   *
   * 对当前项目来说，metadata 本身就是 skill 的运行时扩展对象，例如：
   *   {"always":true,"requires":{"env":["OPENAI_API_KEY"]}}
   *
   * 解析失败时返回空对象，保证 skills 加载过程尽量稳健，不会因为单个 skill
   * 的 metadata 写错而让整个 AgentLoop 初始化失败。
   */
  private parseSkillRuntimeMetadata(
    raw: string | undefined
  ): SkillRuntimeMetadata {
    if (!raw) {
      return {}
    }

    try {
      const data = JSON.parse(raw)
      return data && typeof data === 'object' && !Array.isArray(data)
        ? (data as SkillRuntimeMetadata)
        : {}
    } catch {
      return {}
    }
  }

  /**
   * 根据 metadata.requires 检查当前环境是否满足 skill 的依赖条件。
   *
   * 目前支持两类前置条件：
   * - bins: 当前机器上必须存在的命令行工具
   * - env: 必须存在的环境变量
   */
  private getMissingRequirements(metadata: SkillRuntimeMetadata): string[] {
    const missing: string[] = []
    const requires = metadata.requires
    if (!requires || typeof requires !== 'object') {
      return missing
    }

    if (Array.isArray(requires.bins)) {
      for (const bin of requires.bins) {
        if (typeof bin === 'string' && !commandExists(bin)) {
          missing.push(`CLI: ${bin}`)
        }
      }
    }

    if (Array.isArray(requires.env)) {
      for (const envName of requires.env) {
        if (typeof envName === 'string' && !process.env[envName]) {
          missing.push(`ENV: ${envName}`)
        }
      }
    }

    return missing
  }

  // 去掉 markdown frontmatter，只保留真正要注入给模型看的技能正文。
  private stripFrontmatter(content: string): string {
    if (!content.startsWith('---')) {
      return content.trim()
    }

    return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
  }
}
