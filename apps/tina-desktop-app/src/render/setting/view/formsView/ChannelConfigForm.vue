<template>
  <div class="flex h-full w-full flex-col gap-4 overflow-auto">
    <DynamicForm
      v-if="schema"
      :schema="schema"
      :values="values"
      :submitting="submitting || loading"
      @update:values="handleValuesUpdate"
      @submit="handleSubmit"
      @invalid="handleInvalid"
    >
      <template #actions="{ saving, disabled, submit }">
        <div class="w-full flex align-center justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <!-- TODO: 这个要封装到ui组件库,涉及使用 daisyUI 都应该封装到 ui 库，减少桌面端的样式，专注于业务逻辑 -->
            <span class="badge" :class="statusBadgeClass">
              {{ statusText }}
            </span>
            <span class="text-sm">
              {{ statusMessage }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <BaseButton :disabled="loading || operating" @click="handleRefresh">
              <span v-if="operating" class="loading loading-spinner" />
              刷新
            </BaseButton>
            <BaseButton
              :disabled="disabled || saving"
              color="primary"
              @click="submit"
            >
              <span v-if="saving" class="loading loading-spinner" />
              {{ schema.saveText || '保存' }}
            </BaseButton>
          </div>
        </div>
      </template>
    </DynamicForm>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BaseButton, DynamicForm } from '@tina-chris/tina-ui'
import { useChannelConfigForm } from '../../composables/useChannelConfigForm'

import type {
  DynamicFormSubmitPayload,
  DynamicFormValues,
  FormValidationErrors,
} from '@tina-chris/tina-ui'

const toast = inject<any>('toast')
const route = useRoute()
const router = useRouter()

const providerKey = computed(() => String(route.params.providerKey || ''))

const {
  load,
  loading,
  operating,
  reloadStatus,
  save,
  schema,
  status,
  submitting,
  updateValues,
  values,
} = useChannelConfigForm()

const statusText = computed(() => {
  return status.value?.connected ? '已连接' : '未连接'
})

const statusMessage = computed(() => {
  return status.value?.message || '暂无连接状态。'
})

const statusBadgeClass = computed(() => {
  return status.value?.connected ? 'badge-success' : 'badge-ghost'
})

const handleValuesUpdate = (next: DynamicFormValues) => {
  updateValues(next)
}

const loadForm = async () => {
  const key = providerKey.value
  if (!key) {
    toast.error?.('无效的聊天通道标识')
    router.replace('/setting/channelprovider')
    return
  }

  try {
    await load(key)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载聊天通道配置表单失败'
    toast.error?.(message)
  }
}

const handleSubmit = async (payload: DynamicFormSubmitPayload) => {
  if (!providerKey.value) {
    toast.error?.('无效的聊天通道标识')
    return
  }

  try {
    await save(providerKey.value, payload.values)
    toast.success?.('聊天通道配置保存成功，退回选择页并启用才可生效。')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '保存聊天通道配置失败'
    toast.error?.(message)
    await handleRefresh()
  }
}

const handleInvalid = (errors: FormValidationErrors<DynamicFormValues>) => {
  if (Object.keys(errors).length > 0) {
    toast.warning?.('表单校验未通过。')
  }
}

const handleRefresh = async () => {
  if (!providerKey.value) {
    return
  }

  try {
    await reloadStatus(providerKey.value)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '刷新聊天通道状态失败'
    toast.error?.(message)
  }
}

watch(
  () => providerKey.value,
  () => {
    loadForm()
  },
  { immediate: true }
)
</script>
