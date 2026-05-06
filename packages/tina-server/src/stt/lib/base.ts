import type { DynamicFormSchema } from '@tina-chris/tina-ui'

// 基础 stt 抽象类定义，后续只需要实现这个抽象类就可以适配新的 stt 模型了
export type STTConfigFormSchema = DynamicFormSchema

export type STTTranscriptHandler = (transcript: string) => void
export type STTErrorHandler = (error: Error) => void

export abstract class BaseSTT {
  // 开启连接
  abstract connect(): Promise<void>
  // 注册识别结果回调，由 STTManager 将结果转发到消息总线
  abstract setTranscriptHandler(handler: STTTranscriptHandler): void
  // 注册错误回调，由 STTManager 统一处理并反馈
  abstract setErrorHandler(handler: STTErrorHandler): void
  // 接收并处理音频数据
  abstract handleAudio(audio: ArrayBuffer): Promise<void>
  // 关闭连接，释放资源等清理工作
  abstract close(): Promise<void>
}
