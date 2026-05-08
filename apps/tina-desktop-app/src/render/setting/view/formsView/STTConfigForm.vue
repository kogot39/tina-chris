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
import { useSttConfigForm } from '../../composables/useSttConfigForm'

import type {
  DynamicFormSubmitPayload,
  DynamicFormValues,
  FormValidationErrors,
} from '@tina-chris/tina-ui'

const toast = inject<any>('toast')
const route = useRoute()
const router = useRouter()

// 从路由参数中获取当前 STT 提供商的标识，用于加载对应的配置表单
const providerKey = computed(() => {
  return String(route.params.providerKey || '')
})

const { loading, schema, submitting, values, load, save, updateValues } =
  useSttConfigForm()

const loadForm = async () => {
  const key = providerKey.value
  if (!key) {
    toast.error?.('无效的 STT 平台标识')
    router.replace('/setting/sttprovider')
    return
  }

  try {
    await load(key)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载 STT 配置表单失败'
    toast.error?.(message)
  }
}

const saveForm = async (nextValues: DynamicFormValues) => {
  await save(providerKey.value, nextValues)
  toast.success?.('STT 配置已保存，可在平台卡片开关中启用。')
}

const handleSubmit = async (payload: DynamicFormSubmitPayload) => {
  if (!providerKey.value) {
    toast.error?.('无效的 STT 平台标识')
    return
  }
  try {
    await saveForm(payload.values)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存 STT 配置失败'
    toast.error?.(message)
  }
}

const handleInvalid = (errors: FormValidationErrors<DynamicFormValues>) => {
  const hasErrors = Object.keys(errors).length > 0
  if (hasErrors) {
    toast.warning?.('表单校验未通过。')
  }
}

// 当表单值发生变化时，更新组件状态中的 values 对象，确保表单组件能够正确地响应用户输入
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
