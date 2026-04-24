import { SpeakTagStreamParser } from '@/agent/speakTagParser'

const parseSpeak = new SpeakTagStreamParser()

const testInput = '< speak >你好，Asuka！有什么我可以帮你的？< /speak >'

const testInputArray = []

for (const char of testInput) {
  testInputArray.push(char)
}

for (const char of testInputArray) {
  const events = parseSpeak.process(char)
  for (const event of events) {
    console.log('Parsed event:', event)
  }
}

const finalEvents = parseSpeak.finish()
for (const event of finalEvents) {
  console.log('Final parsed event:', event)
}
