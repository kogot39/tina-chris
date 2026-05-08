// 基本逻辑：
// 1. 创建一个 `useAudio` 组合函数，内部管理音频捕获和播放的状态
// 2. 支持波形绘制，传入绘制函数，绘制函数接受音频数据，捕获到音频数据时调用绘制函数更新波形图
// 3. TODO: 完成基本功能后，后续支持降级，未配置 STT 或 多模态 时改用浏览器原生的语音识别功能

// TODO: 不再使用 websocket ，改为通过回调导出音频数据，由外部组件决定如何处理
import { ref } from 'vue'
import { AudioCapture } from '../utils/audio/capture'
import { createAudioPlayback } from '../utils/audio/playback'

export function useAudio(captureCallback?: (chunk: Int16Array) => void) {
  const audioCapture = new AudioCapture()
  const audioPlayback = createAudioPlayback({
    onEnd: () => {
      isPlaying.value = false
    },
  })

  const isRecording = ref(false)
  const isPlaying = ref(false)

  // 发送音频至服务器
  const handleAudioChunk = (chunk: Int16Array) => {
    if (captureCallback) {
      captureCallback(chunk)
    }
  }

  // 提前预热：加载 ONNX 模型、获取麦克风权限，避免用户点击后的冷启动延迟
  audioCapture.prewarm({ onSendCallback: handleAudioChunk })

  // 开始录音函数，接收绘制回调
  const startRecording = async (drawLoop?: (dataArray: Uint8Array) => void) => {
    try {
      // 首次调用时 vad 已预热完成，init 仅更新回调引用（即刻返回）
      await audioCapture.init({
        onSendCallback: handleAudioChunk,
      })
      await audioCapture.startAudioProcessing()
      isRecording.value = true

      // 传入绘制回调，内部驱动循环
      if (drawLoop) {
        audioCapture.startVisualization(drawLoop)
      }
    } catch (e) {
      console.error('Microphone access failed:', e)
    }
  }

  // 停止录音
  const stopRecording = () => {
    audioCapture.stopAudioProcessing()
    audioCapture.stopVisualization()
    isRecording.value = false
  }

  // 传入播放数据
  const pushAudio = (pcmBase64: string) => {
    audioPlayback.push(pcmBase64)
    if (!isPlaying.value) {
      isPlaying.value = true
    }
  }

  // 停止播放
  const stopPlaying = () => {
    audioPlayback.stop()
    isPlaying.value = false
  }

  // 中断并清空当前调度
  const flushPlayback = () => {
    audioPlayback.stop()
    audioPlayback.resetScheduling()
  }

  return {
    isRecording,
    isPlaying,
    startRecording,
    stopRecording,
    stopPlaying,
    flushPlayback,
    pushAudio,
  }
}
