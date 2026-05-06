import { MicVAD } from '@ricky0123/vad-web'
// cdn 加载 VAD 和 onnxruntime-web，避免增加包体积和安装复杂度
const VAD_BASE_ASSET_PATH =
  'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/'
const ORT_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'

// VAD 配置接口
export interface VADConfig {
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  minSpeechMs?: number
  redemptionMs?: number
  preSpeechPadMs?: number
}

export class AudioCapture {
  private vad: MicVAD | null = null
  private vadConfig: VADConfig = {}
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private animationFrameId: number | null = null
  private audioBuffer: Float32Array[] = []
  private isSpeaking = false

  private onSendCallback?: (chunk: Int16Array) => void
  private onRealStartCallback?: () => void
  private onEndCallback?: (audio: Float32Array) => void

  constructor(config?: Partial<VADConfig>) {
    // TODO: 当前的识别效果不是很好需要进行调参，后续可以考虑将 VADConfig 作为参数传入构造函数，允许外部定制 VAD 行为
    // 初始化 VAD 配置
    this.vadConfig = {
      positiveSpeechThreshold: 0.2,
      negativeSpeechThreshold: 0.35,
      minSpeechMs: 200,
      redemptionMs: 1400,
      preSpeechPadMs: 800,
    }
    if (config) {
      this.setVADConfig(config)
    }
  }

  async init({
    onSendCallback,
    onRealStartCallback,
    onEndCallback,
  }: {
    onSendCallback?: (chunk: Int16Array) => void
    onRealStartCallback?: () => void
    onEndCallback?: (audio: Float32Array) => void
  }): Promise<void> {
    if (this.vad) return
    // 保存回调函数
    this.onSendCallback = onSendCallback
    this.onRealStartCallback = onRealStartCallback
    this.onEndCallback = onEndCallback

    // 创建统一的 AudioContext 用于共享音轨
    this.audioContext = new AudioContext()
    // 获取麦克风权限并创建媒体流
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
      },
    })
    // 创建 MediaStreamAudioSourceNode 连接到 AudioContext
    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    source.connect(this.analyser)

    this.vad = await MicVAD.new({
      ...this.vadConfig,
      baseAssetPath: VAD_BASE_ASSET_PATH,
      onnxWASMBasePath: ORT_WASM_BASE_PATH,
      getStream: async () => this.mediaStream!,
      onFrameProcessed: (_, frame) => {
        if (this.isSpeaking) {
          // 缓存说话时的音频数据
          // console.log('Audio frame processed, VAD state:', frame)
          this.audioBuffer.push(new Float32Array(frame))
          const totalSamples = this.audioBuffer.reduce(
            (acc, f) => acc + f.length,
            0
          )

          // 到约 0.1s 的音频数据（vad-web 采样率默认 16kHz，因此 1600 约等同于 0.1 秒）
          if (totalSamples >= 1600) {
            this.flushAudioBuffer()
          }
        }
      },
      onSpeechRealStart: () => {
        this.isSpeaking = true
        this.audioBuffer = []
        this.onRealStartCallback?.()
      },
      onSpeechEnd: (audio) => {
        this.isSpeaking = false
        this.flushAudioBuffer()
        // 不转换 audio ，可在此调用回调函数用于唤醒词监测等后续步骤
        this.onEndCallback?.(audio)
      },
    })
  }

  private flushAudioBuffer() {
    if (this.audioBuffer.length === 0) return
    const totalSamples = this.audioBuffer.reduce((acc, f) => acc + f.length, 0)

    // 合并分块
    const merged = new Float32Array(totalSamples)
    let offset = 0
    for (const f of this.audioBuffer) {
      merged.set(f, offset)
      offset += f.length
    }

    // 转为 Int16Array (PCM 16位)
    const int16Array = new Int16Array(merged.length)
    for (const [i, element] of merged.entries()) {
      const s = Math.max(-1, Math.min(1, element))
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    this.onSendCallback?.(int16Array)
    this.audioBuffer = []
  }

  async startAudioProcessing(startCallback?: () => void): Promise<void> {
    if (!this.vad) {
      await this.init({})
    }
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }

    this.vad?.start()
    startCallback?.()
  }

  stopAudioProcessing(stopCallback?: () => void): void {
    this.vad?.pause() // MicVAD docs 中使用 pause() 来停止监听
    this.audioBuffer = []
    this.isSpeaking = false
    stopCallback?.()
  }

  startVisualization(onData: (dataArray: Uint8Array) => void): void {
    if (!this.analyser) {
      return
    }

    // 准备数据缓冲区
    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const drawLoop = () => {
      if (!this.analyser) return

      // 获取时域数据 (波形)
      this.analyser.getByteTimeDomainData(dataArray)

      // 调用传入的回调函数，将数据交给外部处理
      onData(dataArray)

      this.animationFrameId = requestAnimationFrame(drawLoop)
    }

    drawLoop()
  }

  // 停止波形可视化
  stopVisualization(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  setVADConfig(config: Partial<VADConfig>) {
    this.vadConfig = { ...this.vadConfig, ...config }
  }

  destroy(): void {
    this.stopAudioProcessing()
    this.stopVisualization()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }
    this.vad = null
  }
}
