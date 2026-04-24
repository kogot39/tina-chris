// 简单实现一下消息相关类型
export interface Message {
  role: 'human' | 'agent'
  content: string
  id: string
  timestamp: number
}
