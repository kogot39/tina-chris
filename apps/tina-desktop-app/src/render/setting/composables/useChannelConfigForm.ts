import { ref } from 'vue'
import {
  getChannelConfigForm,
  getChannelStatus,
  getCurrentChannelConfig,
  saveChannelConfig,
  startChannel,
  stopChannel,
} from '../services/channelConfigService'
import { toValues } from '../utils'

import type { DynamicFormSchema, DynamicFormValues } from '@tina-chris/tina-ui'
import type { ChannelStatus } from '../../../shared'

export const useChannelConfigForm = () => {
  const schema = ref<DynamicFormSchema | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const operating = ref(false)
  const values = ref<DynamicFormValues>({})
  const status = ref<ChannelStatus | null>(null)

  const updateValues = (next: DynamicFormValues) => {
    values.value = next
  }

  const reloadStatus = async (providerKey: string) => {
    operating.value = true
    try {
      status.value = await getChannelStatus(providerKey)
      return status.value
    } finally {
      operating.value = false
    }
  }

  const load = async (providerKey: string) => {
    loading.value = true
    try {
      const [nextSchema, nextValues, nextStatus] = await Promise.all([
        getChannelConfigForm(providerKey),
        getCurrentChannelConfig(providerKey),
        getChannelStatus(providerKey),
      ])
      schema.value = nextSchema
      updateValues(toValues(nextValues))
      status.value = nextStatus
    } finally {
      loading.value = false
    }
  }

  const save = async (providerKey: string, nextValues: DynamicFormValues) => {
    submitting.value = true
    try {
      const result = await saveChannelConfig(providerKey, nextValues)
      status.value = result.status
      updateValues(nextValues)
      return result
    } finally {
      submitting.value = false
    }
  }

  const start = async (providerKey?: string) => {
    operating.value = true
    try {
      const statuses = await startChannel(providerKey)
      status.value = providerKey
        ? statuses.find((item) => item.providerKey === providerKey) || null
        : status.value
      return statuses
    } finally {
      operating.value = false
    }
  }

  const stop = async (providerKey?: string) => {
    operating.value = true
    try {
      const statuses = await stopChannel(providerKey)
      status.value = providerKey
        ? statuses.find((item) => item.providerKey === providerKey) || null
        : status.value
      return statuses
    } finally {
      operating.value = false
    }
  }

  return {
    loading,
    operating,
    schema,
    status,
    submitting,
    values,
    updateValues,
    load,
    reloadStatus,
    save,
    start,
    stop,
  }
}
