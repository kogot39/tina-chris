import { ref } from 'vue'
import {
  getCurrentSTTConfig,
  getCurrentSTTProvider,
  getSTTConfigForm,
  saveSTTConfig,
} from '../services/sttConfigService'
import { toValues } from '../utils'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'

export const useSttConfigForm = () => {
  const schema = ref<DynamicFormSchema | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const currentProvider = ref('')
  const values = ref<DynamicFormValues>({})

  const updateValues = (next: DynamicFormValues) => {
    values.value = next
  }

  const load = async (providerKey: string) => {
    loading.value = true
    try {
      const [nextSchema, nextValues, nextCurrent] = await Promise.all([
        getSTTConfigForm(providerKey),
        getCurrentSTTConfig(providerKey),
        getCurrentSTTProvider(),
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
      const result = await saveSTTConfig(providerKey, nextValues)
      currentProvider.value = result.current || ''
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
