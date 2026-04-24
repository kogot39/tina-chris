import { ref } from 'vue'
import {
  createTTSVoiceClone,
  deleteTTSVoiceClone,
  getCurrentTTSConfig,
  getCurrentTTSProvider,
  getTTSConfigForm,
  getTTSVoiceCloneForm,
  listTTSVoiceClones,
  saveTTSConfig,
} from '../services/ttsConfigService'
import { toValues } from '../utils'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'
import type { TTSVoiceCloneItem } from '../../../shared'

// 集成了 TTS 配置与语音克隆配置的组合式函数
export const useTtsConfigForm = () => {
  const schema = ref<DynamicFormSchema | null>(null)
  const voiceCloneSchema = ref<DynamicFormSchema | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const cloneSubmitting = ref(false)
  const currentProvider = ref('')
  const values = ref<DynamicFormValues>({})
  const cloneValues = ref<DynamicFormValues>({})
  const voiceClones = ref<TTSVoiceCloneItem[]>([])

  const updateValues = (next: DynamicFormValues) => {
    values.value = next
  }

  const updateCloneValues = (next: DynamicFormValues) => {
    cloneValues.value = next
  }

  const reloadVoiceClones = async (providerKey: string) => {
    voiceClones.value = await listTTSVoiceClones(providerKey)
  }

  const load = async (providerKey: string) => {
    loading.value = true
    try {
      const [nextSchema, nextValues, nextCurrent, nextCloneSchema] =
        await Promise.all([
          getTTSConfigForm(providerKey),
          getCurrentTTSConfig(providerKey),
          getCurrentTTSProvider(),
          // 获取语音克隆的表单结构，如果没有会抛出错误，这里捕获错误并返回 null 来表示不支持语音克隆
          getTTSVoiceCloneForm(providerKey).catch(() => null),
        ])

      schema.value = nextSchema
      voiceCloneSchema.value = nextCloneSchema
      updateValues(toValues(nextValues))
      currentProvider.value = nextCurrent || ''
      // 如果支持语音克隆，加载当前的语音克隆音色列表，否则清空语音克隆数据
      if (nextCloneSchema) {
        await reloadVoiceClones(providerKey).catch(() => {
          voiceClones.value = []
        })
      } else {
        voiceClones.value = []
      }
    } finally {
      loading.value = false
    }
  }

  const save = async (providerKey: string, nextValues: DynamicFormValues) => {
    submitting.value = true
    try {
      const result = await saveTTSConfig(providerKey, nextValues)
      currentProvider.value = result.current || providerKey
      updateValues(nextValues)
      return result
    } finally {
      submitting.value = false
    }
  }

  const createVoiceClone = async (
    providerKey: string,
    nextValues: DynamicFormValues
  ) => {
    cloneSubmitting.value = true
    try {
      const result = await createTTSVoiceClone(providerKey, nextValues)
      // 创建成功后，清空语音克隆表单的值并重新加载语音克隆音色列表
      updateCloneValues({})
      await reloadVoiceClones(providerKey)
      return result
    } finally {
      cloneSubmitting.value = false
    }
  }
  // 删除指定的语音克隆，并重新加载语音克隆音色列表以更新界面
  const deleteVoiceClone = async (providerKey: string, voice: string) => {
    await deleteTTSVoiceClone(providerKey, voice)
    await reloadVoiceClones(providerKey)
  }

  return {
    cloneSubmitting,
    cloneValues,
    createVoiceClone,
    currentProvider,
    deleteVoiceClone,
    load,
    loading,
    reloadVoiceClones,
    save,
    schema,
    submitting,
    updateCloneValues,
    updateValues,
    values,
    voiceCloneSchema,
    voiceClones,
  }
}
