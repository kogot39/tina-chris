export type SpeakTagStreamEvent =
  | { type: 'visible'; text: string }
  | { type: 'speakStart' }
  | { type: 'speakText'; text: string }
  | { type: 'speakEnd' }

const OPEN_TAG = '<speak>'
const CLOSE_TAG = '</speak>'
const TAG_PREFIXES = [OPEN_TAG, CLOSE_TAG]

// 减小延迟的一个优化是让模型在输出文本的同时就能开始生成音频，而不是等到整个文本输出完了才开始生成
// 正则表达式来简单判断文本是否已经是一个完整的句子了
// 如果为完整的句子了，就可以提前提交给 TTS 供应商生成音频了，减少等待时间
const SENTENCE_END_RE =
  /(?:\.{3}|\u2026|[\u3002\uFF01\uFF1F!?\uFF1B;\r\n])(?:["'\u201D\u2019\uFF09\u3011\u300B\u300D\u300F\]\s]*)$/

// 判断当前的 pendingTag 是否是某个标签的前缀了，如果不是前缀了说明这个 pendingTag 已经不可能形成一个合法的标签了，就可以直接当成文本处理了
const isTagPrefix = (value: string): boolean => {
  // .replace(/\s/g, '') 避免模型输出带空格的标签导致无法正确识别
  return TAG_PREFIXES.some((tag) => tag.startsWith(value.replace(/\s/g, '')))
}

export class SpeakTagStreamParser {
  private insideSpeak = false
  private pendingTag = ''
  private speakCommitBuffer = ''

  process(delta: string): SpeakTagStreamEvent[] {
    const events: SpeakTagStreamEvent[] = []

    for (const char of delta) {
      if (this.pendingTag) {
        this.pendingTag += char
        // 判定 pendingTag 是否已经形成了一个完整的标签了
        this.resolvePendingTag(events)
        continue
      }

      if (char === '<') {
        this.pendingTag = '<'
        continue
      }

      this.pushText(events, char)
    }

    return this.mergeTextEvents(events)
  }

  finish(): SpeakTagStreamEvent[] {
    const events: SpeakTagStreamEvent[] = []

    if (this.pendingTag) {
      this.pushText(events, this.pendingTag)
      this.pendingTag = ''
    }

    if (this.insideSpeak) {
      this.emitSpeakBoundary(events, { force: true })
      this.insideSpeak = false
    }

    return this.mergeTextEvents(events)
  }

  private resolvePendingTag(events: SpeakTagStreamEvent[]): void {
    if (this.pendingTag.replace(/\s/g, '') === OPEN_TAG) {
      this.pendingTag = ''
      if (!this.insideSpeak) {
        // 进入 speak 标签
        this.insideSpeak = true
        this.speakCommitBuffer = ''
        events.push({ type: 'speakStart' })
      }
      return
    }

    if (this.pendingTag.replace(/\s/g, '') === CLOSE_TAG) {
      this.pendingTag = ''
      if (this.insideSpeak) {
        // 结束当前的 speakText 事件，通知 TTS commit
        this.emitSpeakBoundary(events, { force: true })
        this.insideSpeak = false
      }
      return
    }

    if (isTagPrefix(this.pendingTag)) {
      return
    }

    this.pushText(events, this.pendingTag)
    this.pendingTag = ''
  }

  private pushText(events: SpeakTagStreamEvent[], text: string): void {
    if (!text) {
      return
    }
    // 原内容与语音文本，直接当成可见文本事件输出
    events.push({ type: 'visible', text })
    if (this.insideSpeak) {
      // 语音文本会多一个 speakText 事件，供 TTS 合成语音的
      events.push({ type: 'speakText', text })
      this.speakCommitBuffer += text
      this.emitSpeakBoundary(events, { force: false })
    }
  }

  private emitSpeakBoundary(
    events: SpeakTagStreamEvent[],
    options: { force: boolean }
  ): void {
    const buffered = this.speakCommitBuffer.trim()
    if (!buffered) {
      return
    }
    // 只有当缓冲区文本看起来像是一个完整的句子了，或者被强制提交了，才会触发 speakEnd 事件，通知 TTS 可以开始合成语音了
    if (!options.force && !SENTENCE_END_RE.test(buffered)) {
      return
    }

    this.speakCommitBuffer = ''
    events.push({ type: 'speakEnd' })
  }
  // 将一个 delta 中连续的同类型事件合并成一个事件，减少事件数量，减小处理开销
  private mergeTextEvents(
    events: SpeakTagStreamEvent[]
  ): SpeakTagStreamEvent[] {
    const merged: SpeakTagStreamEvent[] = []

    for (const event of events) {
      const previous = merged[merged.length - 1]
      if (
        previous &&
        previous.type === event.type &&
        (event.type === 'visible' || event.type === 'speakText') &&
        (previous.type === 'visible' || previous.type === 'speakText')
      ) {
        previous.text += event.text
        continue
      }

      merged.push(event)
    }

    return merged
  }
}
