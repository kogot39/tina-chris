import { MicVAD } from '@ricky0123/vad-web'

const VAD_BASE_ASSET_PATH =
  'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/'
const ORT_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'

export interface VADConfig {
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  minSpeechMs?: number
  redemptionMs?: number
  preSpeechPadMs?: number
}

export interface AudioCaptureConfig extends VADConfig {
  // 音频预增益，用于放大较小声语音，默认 2.0
  preGain?: number
}

export class AudioCapture {
  private vad: MicVAD | null = null
  private vadConfig: VADConfig = {}
  private preGain: number
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private animationFrameId: number | null = null
  private audioBuffer: Float32Array[] = []
  private isSpeaking = false
  private prewarmed = false

  private onSendCallback?: (chunk: Int16Array) => void
  private onRealStartCallback?: () => void
  private onEndCallback?: (audio: Float32Array) => void

  constructor(config?: Partial<AudioCaptureConfig>) {
    this.preGain = config?.preGain ?? 2.0
    this.vadConfig = {
      // positive < negative 会导致无滞回，此处修正为正序：
      // prob >= 0.2 → speech (sensitive enough for quiet speech)
      // prob <= 0.1 → silence
      // 0.1 < prob < 0.2 → hysteresis (keep current state)
      positiveSpeechThreshold: 0.2,
      negativeSpeechThreshold: 0.1,
      minSpeechMs: 100,
      redemptionMs: 2000,
      preSpeechPadMs: 1200,
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
    // 始终更新回调引用，确保外部组件重新渲染后回调不失效
    if (onSendCallback !== undefined) this.onSendCallback = onSendCallback
    if (onRealStartCallback !== undefined)
      this.onRealStartCallback = onRealStartCallback
    if (onEndCallback !== undefined) this.onEndCallback = onEndCallback

    // VAD 已初始化（预热完成），仅回填回调后即刻返回
    if (this.vad) return

    this.audioContext = new AudioContext()
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
      },
    })

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
          this.audioBuffer.push(new Float32Array(frame))
          const totalSamples = this.audioBuffer.reduce(
            (acc, f) => acc + f.length,
            0
          )

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
        this.onEndCallback?.(audio)
      },
    })

    // 初始化完成后立即暂停，等待用户点击时通过 startAudioProcessing 启动
    this.vad.pause()
    this.prewarmed = true
  }

  // 预热：提前加载 ONNX 模型、获取麦克风权限，避免用户点击后的冷启动延迟 */
  async prewarm(callbacks?: {
    onSendCallback?: (chunk: Int16Array) => void
    onRealStartCallback?: () => void
    onEndCallback?: (audio: Float32Array) => void
  }): Promise<void> {
    if (this.prewarmed || this.vad) return
    await this.init(callbacks ?? {})
  }

  private flushAudioBuffer() {
    if (this.audioBuffer.length === 0) return
    const totalSamples = this.audioBuffer.reduce((acc, f) => acc + f.length, 0)

    const merged = new Float32Array(totalSamples)
    let offset = 0
    for (const f of this.audioBuffer) {
      merged.set(f, offset)
      offset += f.length
    }

    // 转为 Int16Array (PCM 16位)，并应用预增益放大较小声语音
    const int16Array = new Int16Array(merged.length)
    for (const [i, element] of merged.entries()) {
      const gained = element * this.preGain
      const s = Math.max(-1, Math.min(1, gained))
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
    this.vad?.pause()
    this.audioBuffer = []
    this.isSpeaking = false
    stopCallback?.()
  }

  startVisualization(onData: (dataArray: Uint8Array) => void): void {
    if (!this.analyser) {
      return
    }

    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const drawLoop = () => {
      if (!this.analyser) return
      this.analyser.getByteTimeDomainData(dataArray)
      onData(dataArray)
      this.animationFrameId = requestAnimationFrame(drawLoop)
    }

    drawLoop()
  }

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
    this.prewarmed = false
  }
}
