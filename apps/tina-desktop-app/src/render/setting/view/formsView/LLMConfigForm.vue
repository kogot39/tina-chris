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
import { useLlmConfigForm } from '../../composables/useLlmConfigForm'

import type {
  DynamicFormSubmitPayload,
  DynamicFormValues,
  FormValidationErrors,
} from '@tina-chris/tina-ui'

const toast = inject<any>('toast')
const modal = inject<any>('modal')
const route = useRoute()
const router = useRouter()

// 从路由参数中获取当前 LLM 平台的标识，作为加载和保存配置的关键参数
const providerKey = computed(() => {
  return String(route.params.providerKey || '')
})

const {
  currentProvider,
  loading,
  schema,
  submitting,
  values,
  load,
  save,
  updateValues,
} = useLlmConfigForm()

// 加载当前 LLM 平台的配置表单已有的数据
const loadForm = async () => {
  const key = providerKey.value
  if (!key) {
    toast.error?.('无效的 LLM 平台标识')
    router.replace('/setting/llmprovider')
    return
  }

  try {
    await load(key)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载 LLM 配置表单失败'
    toast.error?.(message)
  }
}

const saveForm = async (nextValues: DynamicFormValues) => {
  await save(providerKey.value, nextValues)
  toast.success?.('LLM 配置保存成功，将立即用于后续对话。')
}

const handleSubmit = async (payload: DynamicFormSubmitPayload) => {
  if (!providerKey.value) {
    toast.error?.('无效的 LLM 平台标识')
    return
  }
  // 如果当前已配置的 LLM 平台与即将保存的不同，提示用户确认切换平台可能导致配置变更
  if (currentProvider.value && currentProvider.value !== providerKey.value) {
    modal.warning?.('切换 LLM 平台后将以新平台配置为准，是否继续？', {
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
    const message = error instanceof Error ? error.message : '保存 LLM 配置失败'
    toast.error?.(message)
  }
}

const handleInvalid = (errors: FormValidationErrors<DynamicFormValues>) => {
  // 检查错误数量，如果存在错误则提示用户表单校验未通过
  const hasErrors = Object.keys(errors).length > 0
  if (hasErrors) {
    toast.warning?.('表单校验未通过。')
  }
}

// 更新表单值时同步更新到组件状态，确保表单交互的响应性和数据一致性
const handleValuesUpdate = (nextValues: DynamicFormValues) => {
  updateValues(nextValues)
}

watch(
  () => providerKey.value,
  () => {
    loadForm()
  },
  { immediate: true }
)
</script>
