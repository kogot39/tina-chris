export type TTSAudioChunkEvent = {
  id: string
  audio: string
  ts: number
}

export type TTSErrorHandler = (error: Error) => void

// TTS 抽象类，定义了 TTS 供应商需要实现的接口，包括连接、发送文本、接收音频事件、错误处理和关闭连接等方法
// 这样 TTSManager 就可以通过这个抽象类来调用不同供应商的 TTS 功能
export abstract class BaseTTS {
  abstract connect(): Promise<void>

  // AppendText 允许 TTSManager 分多次发送文本给 TTS 供应商
  abstract appendText(text: string): Promise<void>

  // commit 方法表示文本输入完成，TTS 供应商可以开始处理文本并生成音频了
  abstract commit(): Promise<void>


  // receiveEvents 是一个异步生成器，TTS 供应商通过它来不断地向 TTSManager 发送生成的音频事件，直到整个文本的音频都生成完了
  abstract receiveEvents(): AsyncGenerator<TTSAudioChunkEvent>

  abstract setErrorHandler(handler: TTSErrorHandler): void

  abstract close(): Promise<void>
}
