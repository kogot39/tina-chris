import { QWEN_TTS_MODELS } from './qwenTTS'
import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

// TODO: 后续声音复刻功能可以抽象成一个独立的模块，提供统一的接口供TTSManager调用，这样可以更好地解耦和复用，同时也方便后续接入其他声音复刻服务
export const ttsModel = QWEN_TTS_MODELS[0].value
const voiceEnrollmentModel = 'qwen-voice-enrollment'

const VOICE_COPY_URL =
	'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'

export type CreateVoiceInput = {
	apiKey: string
	preferredName: string
	audioData: string
	targetModel?: string
	text?: string
	language?: string
}

export type ListVoiceInput = {
	apiKey: string
	pageIndex?: number
	pageSize?: number
}

export type DeleteVoiceInput = {
	apiKey: string
	voice: string
}

type DashscopeResponse<TOutput> = {
	output?: TOutput
	usage?: {
		count: number
	}
	request_id?: string
	code?: string
	message?: string
}
// 这个是与前端交互的声音复刻数据结构，包含了声音ID、创建时间和对应的目标模型等信息
// 后续其他供应商的声音复刻功能要根据这个数据结构进行适配，保持前端展示的一致性和简化前端的处理逻辑
type VoiceItem = {
	voice: string
	gmt_create: string
	target_model: string
}
// 增删查接口实现
const postCustomization = async <TOutput>(apiKey: string, input: object) => {
	const res = await fetch(VOICE_COPY_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: voiceEnrollmentModel,
			input,
		}),
	})

	const json = (await res.json()) as DashscopeResponse<TOutput>
	if (!res.ok) {
		throw new Error(json.message || `DashScope request failed: ${res.status}`)
	}

	if (json.code) {
		throw new Error(json.message || json.code)
	}

	return json
}

export const createVoiceTone = async ({
	apiKey,
	preferredName,
	audioData,
	targetModel = ttsModel,
	text,
	language,
}: CreateVoiceInput) => {
	const input: Record<string, unknown> = {
		action: 'create',
		target_model: targetModel,
		preferred_name: preferredName,
		audio: {
			data: audioData,
		},
	}

	if (text) input.text = text
	if (language) input.language = language

	return postCustomization<{ voice: string; target_model: string }>(
		apiKey,
		input
	)
}

export const listVoiceTone = async ({
	apiKey,
	pageIndex = 0,
	pageSize = 10,
}: ListVoiceInput) => {
	return postCustomization<{ voice_list: VoiceItem[] }>(apiKey, {
		action: 'list',
		page_index: pageIndex,
		page_size: pageSize,
	})
}

export const deleteVoiceTone = async ({ apiKey, voice }: DeleteVoiceInput) => {
	return postCustomization<never>(apiKey, {
		action: 'delete',
		voice,
	})
}

export const getQwenVoiceCloneForm = (): DynamicFormSchema => ({
  key: 'tts-qwen-voice-clone',
  legend: 'Qwen 音色复刻',
  saveText: '创建音色',
  fields: [
    {
      name: 'preferredName',
      type: 'input',
      label: '音色名称',
      hint: '用于生成复刻音色的偏好名称。',
      required: true,
      valueType: 'string',
      rules: [{ type: 'required', message: '请输入音色名称' }],
    },
    {
      name: 'audioFile',
      type: 'upload',
      label: '音频文件',
      hint: '上传用于复刻的音频文件。',
      required: true,
      valueType: 'file',
      rules: [
        {
          type: 'file',
          maxSize: 20 * 1024 * 1024,
          mimeTypes: ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4'],
          message: '请上传 20MB 以内的音频文件',
        },
      ],
      componentProps: {
        accept: 'audio/*',
      },
    },
    {
      name: 'text',
      type: 'textarea',
      label: '音频文本',
      hint: '可选，填写音频中对应的文本有助于提升复刻质量。',
      valueType: 'string',
      span: 2,
    },
    {
      name: 'language',
      type: 'select',
      label: '语言类型',
      valueType: 'string',
      required: true,
      componentProps: {
          options: [
            { label: '中文', value: 'zh' },
            { label: '英文', value: 'en' },
            { label: '日语', value: 'ja' },
            { label: '韩语', value: 'ko' },
            { label: '法语', value: 'fr' },
            { label: '德语', value: 'de' },
            { label: '西班牙语', value: 'es' },
            { label: '意大利语', value: 'it' },
            { label: '葡萄牙语', value: 'pt' },
            { label: '俄语', value: 'ru' },
          ],
        },
    },
  ],
})

export const normalizeQwenVoiceCloneValues = (
  values: DynamicFormValues
): {
  preferredName: string
  audioData: string
  text?: string
  language?: string
} => {
  const preferredName =
    typeof values.preferredName === 'string' ? values.preferredName.trim() : ''
  const audioData =
    typeof values.audioData === 'string' ? values.audioData.trim() : ''
  const text = typeof values.text === 'string' ? values.text.trim() : ''
  const language =
    typeof values.language === 'string' ? values.language.trim() : ''

  if (!preferredName) {
    throw new Error('Voice clone preferredName is required.')
  }
  if (!audioData) {
    throw new Error('Voice clone audioData is required.')
  }

  return {
    preferredName,
    audioData,
    text: text || undefined,
    language: language || undefined,
  }
}
