import { StringEnum, Type } from '@mariozechner/pi-ai'
import { Tool, type ToolParameters } from './base'
// 网络搜索和内容抓取相关工具实现，使用了 Bocha Search API 作为示例搜索提供商

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const stripTags = (value: string): string => {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

const normalizeText = (value: string): string => {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const toMarkdown = (html: string): string => {
  let text = html
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => `[${stripTags(label)}](${href})`
  )
  text = text.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, level: string, content: string) =>
      `\n${'#'.repeat(Number(level))} ${stripTags(content)}\n`
  )
  text = text.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_match, content: string) => `\n- ${stripTags(content)}`
  )
  text = text.replace(/<\/(p|div|section|article)>/gi, '\n\n')
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n')
  return normalizeText(stripTags(text))
}

const readString = (
  params: Record<string, unknown>,
  key: string,
  fallback = ''
): string => {
  return typeof params[key] === 'string' ? String(params[key]) : fallback
}

const readNumber = (
  params: Record<string, unknown>,
  key: string,
  fallback: number
): number => {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

type BochaResultItem = {
  name?: unknown
  url?: unknown
  snippet?: unknown
}

const pickBochaResults = (payload: unknown): BochaResultItem[] => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const root = payload as Record<string, any>
  const value = root.data?.webPages?.value
  return Array.isArray(value) ? value : []
}

export class WebSearchTool extends Tool {
  constructor(
    private apiKey: string,
    private maxResults = 5
  ) {
    super()
  }

  get name(): string {
    return 'web_search'
  }

  get description(): string {
    return 'Search the web using the configured Bocha search provider.'
  }

  get parameters(): ToolParameters {
    return Type.Object({
      query: Type.String({ description: 'Search query.' }),
      count: Type.Optional(
        Type.Integer({
          description: 'Number of results, from 1 to 10.',
          minimum: 1,
          maximum: 10,
        })
      ),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const query = readString(params, 'query').trim()
    if (!query) {
      return 'Error: query is required.'
    }

    const requestedCount = readNumber(params, 'count', this.maxResults)
    const count = Math.min(Math.max(requestedCount, 1), 10)

    try {
      const response = await fetch('https://api.bocha.cn/v1/web-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, count }),
      })

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`
      }

      const results = pickBochaResults(await response.json())
      if (results.length === 0) {
        return `No results for: ${query}`
      }

      const lines = [`Results for: ${query}`, '']
      results.slice(0, count).forEach((item, index) => {
        const name = typeof item.name === 'string' ? item.name : ''
        const url = typeof item.url === 'string' ? item.url : ''
        const snippet = typeof item.snippet === 'string' ? item.snippet : ''
        lines.push(`${index + 1}. ${name}`)
        lines.push(`   ${url}`)
        if (snippet) {
          lines.push(`   ${snippet}`)
        }
      })

      return lines.join('\n')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error: ${message}`
    }
  }
}

export class WebFetchTool extends Tool {
  constructor(private maxChars = 50000) {
    super()
  }

  get name(): string {
    return 'web_fetch'
  }

  get description(): string {
    return 'Fetch a URL and extract readable JSON, markdown, or text content.'
  }

  get parameters(): ToolParameters {
    return Type.Object({
      url: Type.String({ description: 'URL to fetch.' }),
      extractMode: Type.Optional(
        StringEnum(['markdown', 'text'] as const, {
          description: 'Readable extraction mode.',
          default: 'markdown',
        })
      ),
      maxChars: Type.Optional(Type.Integer({ minimum: 100 })),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const url = readString(params, 'url').trim()
    const extractMode = readString(params, 'extractMode', 'markdown')
    const maxChars = Math.max(
      readNumber(params, 'maxChars', this.maxChars),
      100
    )

    if (!url) {
      return JSON.stringify({ error: 'url is required', url: '' })
    }

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      })
      const contentType = response.headers.get('content-type') || ''
      let text = ''
      let extractor = 'raw'

      if (contentType.includes('application/json')) {
        text = JSON.stringify(await response.json(), null, 2)
        extractor = 'json'
      } else {
        const raw = await response.text()
        const looksHtml =
          contentType.includes('text/html') ||
          /^\s*(<!doctype|<html)/i.test(raw.slice(0, 256))

        if (looksHtml) {
          const title = stripTags(
            raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
          )
          const body = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || raw
          const content =
            extractMode === 'text' ? stripTags(body) : toMarkdown(body)
          text = title ? `# ${title}\n\n${content}` : content
          extractor = 'html'
        } else {
          text = raw
        }
      }

      const truncated = text.length > maxChars
      if (truncated) {
        text = text.slice(0, maxChars)
      }

      return JSON.stringify({
        url,
        finalUrl: response.url,
        status: response.status,
        extractor,
        truncated,
        length: text.length,
        text,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return JSON.stringify({ error: message, url })
    }
  }
}
