import { ref } from 'vue'
import {
  getCurrentToolConfig,
  getCurrentToolProvider,
  getToolConfigForm,
  saveToolConfig,
} from '../services/toolConfigService'
import { toValues } from '../utils'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const useToolConfigForm = () => {
  const schema = ref<DynamicFormSchema | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const currentProvider = ref('')
  const values = ref<DynamicFormValues>({})

  const updateValues = (next: DynamicFormValues) => {
    values.value = next
  }

  const load = async (toolType: string, providerKey: string) => {
    loading.value = true
    try {
      const [nextSchema, nextValues, nextCurrent] = await Promise.all([
        // 多一个工具类型参数，获取对应工具的表单结构、当前配置项值和当前选中的提供商
        getToolConfigForm(toolType, providerKey),
        getCurrentToolConfig(toolType, providerKey),
        getCurrentToolProvider(toolType),
      ])

      schema.value = nextSchema
      values.value = toValues(nextValues)
      currentProvider.value = nextCurrent || ''
    } finally {
      loading.value = false
    }
  }

  const save = async (
    toolType: string,
    providerKey: string,
    nextValues: DynamicFormValues
  ) => {
    submitting.value = true
    try {
      const result = await saveToolConfig(toolType, providerKey, nextValues)
      currentProvider.value = result.current || providerKey
      values.value = nextValues
      return result
    } finally {
      submitting.value = false
    }
  }

  return {
    currentProvider,
    load,
    loading,
    save,
    schema,
    submitting,
    updateValues,
    values,
  }
}
