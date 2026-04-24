// 配合 VoiceRecordButton 组件使用，用于绘制录音动画的循环函数
import { type Ref, ref } from 'vue'

export function useDrawLoop(): {
  waveformData: Ref<number[]>
  drawLoop: (dataArray: Uint8Array) => void
} {
  const waveformData = ref<number[]>([0, 0, 0, 0, 0])

  const drawLoop = (dataArray: Uint8Array) => {
    const bars = 5
    const segmentWidth = Math.floor(dataArray.length / bars)
    const waves: number[] = []

    for (let i = 0; i < bars; i++) {
      let maxDev = 0
      const start = i * segmentWidth
      const end = i === bars - 1 ? dataArray.length : start + segmentWidth

      for (let j = start; j < end; j++) {
        // getByteTimeDomainData 返回的数据以 128 为中心，因此 128 是静音
        const dev = Math.abs(dataArray[j] - 128)
        if (dev > maxDev) {
          maxDev = dev
        }
      }

      // 将最大偏差映射到 0~1 的范围。
      // 因为实际说话声音很少会达到理论峰值（即偏离 128），这里增加一个增益倍数放大波动，同时用 Math.min 限制最大不超过 1
      const GAIN = 2
      waves.push(Math.min(1, (maxDev * GAIN) / 128))
    }

    waveformData.value = waves
  }

  return { waveformData, drawLoop }
}
