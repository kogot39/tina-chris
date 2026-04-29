const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// 填充时间戳格式
export const pad = (value: number): string => {
  return String(value).padStart(2, '0')
}

export const formatLocalDate = (date = new Date()): string => {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-')
}

// 获取本地时间的完整时间戳，格式为 YYYY-MM-DD HH:mm
export const formatLocalTimestamp = (date = new Date()): string => {
  return [
    formatLocalDate(date),
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ')
}

// 只接受严格的 YYYY-MM-DD，并额外检查日期本身是否合法。
// 例如 2026-02-31 会被 Date 自动滚到 3 月，所以需要反向校验年月日。
export const parseDate = (value: string): Date | null => {
  if (!DATE_PATTERN.test(value)) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

// 日期计算工具，添加指定天数后的日期。注意会正确处理月末和闰年等情况
export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
