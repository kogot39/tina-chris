import { ref } from 'vue'
import {
  getCurrentLLMConfig,
  getCurrentLLMProvider,
  getLLMConfigForm,
  saveLLMConfig,
} from '../services/llmConfigService'
import { toValues } from '../utils'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const useLlmConfigForm = () => {
  const schema = ref<DynamicFormSchema | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const currentProvider = ref('')
  const values = ref<DynamicFormValues>({})

  // 更新表单值的函数，接收一个新的 DynamicFormValues 对象，并将其赋值给 values 的 ref
  const updateValues = (next: DynamicFormValues) => {
    values.value = next
  }

  const load = async (providerKey: string) => {
    loading.value = true
    try {
      // 取表单模板、当前配置项值和当前选中的提供商
      const [nextSchema, nextValues, nextCurrent] = await Promise.all([
        getLLMConfigForm(providerKey),
        getCurrentLLMConfig(providerKey),
        getCurrentLLMProvider(),
      ])

      schema.value = nextSchema
      updateValues(toValues(nextValues))
      currentProvider.value = nextCurrent || ''
    } finally {
      loading.value = false
    }
  }

  const save = async (providerKey: string, nextValues: DynamicFormValues) => {
    submitting.value = true
    try {
      const result = await saveLLMConfig(providerKey, nextValues)
      // 保存成功后，更新当前选中的提供商和表单值
      currentProvider.value = result.current || providerKey
      // 简单确保一致性
      updateValues(nextValues)
      return result
    } finally {
      submitting.value = false
    }
  }

  return {
    currentProvider,
    loading,
    schema,
    submitting,
    values,
    updateValues,
    load,
    save,
  }
}
