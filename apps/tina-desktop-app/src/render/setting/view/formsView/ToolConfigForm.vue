<template>
  <div class="w-full h-full">
    <DynamicForm
      v-if="schema"
      :schema="schema"
      :values="values"
      :submitting="submitting || loading"
      @update:values="handleValuesUpdate"
      @submit="handleSubmit"
      @invalid="handleInvalid"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DynamicForm } from '@tina-chris/tina-ui'
import { useToolConfigForm } from '../../composables/useToolConfigForm'

import type {
  DynamicFormSubmitPayload,
  DynamicFormValues,
  FormValidationErrors,
} from '@tina-chris/tina-ui'

const toast = inject<any>('toast')
const modal = inject<any>('modal')
const route = useRoute()
const router = useRouter()

const toolType = computed(() => String(route.params.toolType || ''))
const providerKey = computed(() => String(route.params.providerKey || ''))

const {
  currentProvider,
  load,
  loading,
  save,
  schema,
  submitting,
  updateValues,
  values,
} = useToolConfigForm()

const loadForm = async () => {
  if (!toolType.value || !providerKey.value) {
    toast.error?.('无效的工具配置标识')
    router.replace('/setting/tools')
    return
  }

  try {
    await load(toolType.value, providerKey.value)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载工具配置表单失败'
    toast.error?.(message)
  }
}

const saveForm = async (nextValues: DynamicFormValues) => {
  await save(toolType.value, providerKey.value, nextValues)
  toast.success?.('工具配置保存成功，将立即用于后续 Agent 对话。')
}

const handleSubmit = async (payload: DynamicFormSubmitPayload) => {
  if (!toolType.value || !providerKey.value) {
    toast.error?.('无效的工具配置标识')
    return
  }

  if (currentProvider.value && currentProvider.value !== providerKey.value) {
    modal.warning?.('切换工具供应平台后将以新平台配置为准，是否继续？', {
      confirmText: '继续保存',
      cancelText: '取消',
      onConfirm: async () => {
        await saveForm(payload.values)
      },
    })
    return
  }

  try {
    await saveForm(payload.values)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存工具配置失败'
    toast.error?.(message)
  }
}

const handleInvalid = (errors: FormValidationErrors<DynamicFormValues>) => {
  if (Object.keys(errors).length > 0) {
    toast.warning?.('表单校验未通过。')
  }
}

const handleValuesUpdate = (nextValues: DynamicFormValues) => {
  updateValues(nextValues)
}

watch(
  () => [toolType.value, providerKey.value],
  () => {
    loadForm()
  },
  { immediate: true }
)
</script>
