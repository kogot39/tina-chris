import { describe, expect, it } from 'vitest'
import { Config } from '../src/config'

describe('Config.updateProviderConfig', () => {
  it('保存 STT provider 配置时不改变 current', () => {
    const config = new Config()

    config.updateProviderConfig('stt', 'qwen', {
      apiKey: 'stt-key',
      language: 'en',
    })

    expect(config.stt.current).toBe('')
    expect(config.stt.qwen.apiKey).toBe('stt-key')
    expect(config.stt.qwen.language).toBe('en')
  })

  it('保存 TTS provider 配置时保留当前启用状态', () => {
    const config = new Config()
    config.tts.current = 'qwen'

    config.updateProviderConfig('tts', 'qwen', {
      apiKey: 'tts-key',
      voice: 'Cherry',
    })

    expect(config.tts.current).toBe('qwen')
    expect(config.tts.qwen.apiKey).toBe('tts-key')
    expect(config.tts.qwen.voice).toBe('Cherry')
  })
})
