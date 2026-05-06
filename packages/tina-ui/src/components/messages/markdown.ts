import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

export const renderMarkdown = (content: string): string => {
  const normalized = content.trim()
  if (!normalized) {
    return ''
  }

  return markdown.render(normalized)
}
