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
const modal = inject<any>('modal')
const route = useRoute()
const router = useRouter()

// 从路由参数中获取当前 STT 提供商的标识，用于加载对应的配置表单
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
} = useSttConfigForm()

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
  toast.success?.('STT 配置保存成功，将在下次会话时生效。')
}

const handleSubmit = async (payload: DynamicFormSubmitPayload) => {
  if (!providerKey.value) {
    toast.error?.('无效的 STT 平台标识')
    return
  }
  // 如果当前已经选中的提供商与即将保存的提供商不同，提示用户确认切换平台可能导致配置项变化
  if (currentProvider.value && currentProvider.value !== providerKey.value) {
    modal.warning?.('切换 STT 平台后将以新平台配置为准，是否继续？', {
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
