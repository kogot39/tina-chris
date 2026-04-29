export const splitLines = (value: string): string[] => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export const normalizeText = (value: string): string => {
  return value.trim()
}

export const renderBulletList = (value: string): string => {
  const items = splitLines(value)
  if (items.length === 0) {
    return ''
  }

  return items.map((item) => `- ${item}`).join('\n')
}

export const renderParagraphs = (value: string): string => {
  const paragraphs = value
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  return paragraphs.join('\n\n')
}

export const renderKeyValueLine = (label: string, value: string): string => {
  return `- **${label}**: ${normalizeText(value)}`
}

export const buildSection = (title: string, content: string): string => {
  const normalizedContent = content.trim()
  return normalizedContent ? `${title}\n\n${normalizedContent}` : title
}

export const readString = (
  params: Record<string, unknown>,
  key: string,
  fallback = ''
): string => {
  return typeof params[key] === 'string' ? params[key] : fallback
}

export const readStringArray = (
  params: Record<string, unknown>,
  key: string
): string[] => {
  const value = params[key]
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}
