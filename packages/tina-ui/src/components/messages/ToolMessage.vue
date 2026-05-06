<template>
  <details
    class="collapse collapse-arrow border border-base-300 bg-base-100 w-[85%]"
    :open="message.status === 'calling'"
  >
    <summary class="collapse-title min-h-0 py-2 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge badge-neutral badge-sm">工具调用</span>
        <span class="font-medium">{{ message.toolName }}</span>
        <span class="badge badge-sm" :class="statusClass">
          {{ statusText }}
        </span>
        <span
          v-if="message.status === 'calling'"
          class="loading loading-spinner loading-xs"
        />
      </div>
    </summary>
    <div class="collapse-content space-y-3 text-sm">
      <p v-if="message.content" class="text-base-content/70">
        {{ message.content }}
      </p>

      <section v-if="hasParameters">
        <div class="mb-1 font-medium text-base-content/70">调用参数</div>
        <pre
          class="max-h-48 overflow-auto rounded bg-base-200 p-2 text-xs whitespace-pre-wrap wrap-break-word"
          >{{ formattedParameters }}</pre
        >
      </section>

      <section v-if="message.error" class="alert alert-error alert-soft py-2">
        {{ message.error }}
      </section>

      <section v-if="hasResult">
        <div class="mb-1 font-medium text-base-content/70">调用结果</div>
        <pre
          class="max-h-60 overflow-auto rounded bg-base-200 p-2 text-xs whitespace-pre-wrap wrap-break-word"
          >{{ formattedResult }}</pre
        >
      </section>

      <p
        v-if="!hasParameters && !hasResult && !message.error"
        class="text-base-content/60"
      >
        暂无可展示的工具详情
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { ToolCallMessage } from '../../types'

const props = defineProps<{
  message: ToolCallMessage
}>()

const hasParameters = computed(() => props.message.parameters !== undefined)
const hasResult = computed(() => props.message.result !== undefined)

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}

const formattedParameters = computed(() =>
  formatValue(props.message.parameters)
)
const formattedResult = computed(() => formatValue(props.message.result))

const statusText = computed(() => {
  if (props.message.status === 'calling') {
    return '调用中'
  }
  if (props.message.status === 'error') {
    return '失败'
  }
  if (props.message.status === 'aborted') {
    return '已中止'
  }
  return '完成'
})

const statusClass = computed(() => {
  if (props.message.status === 'calling') {
    return 'badge-info'
  }
  if (props.message.status === 'error') {
    return 'badge-error'
  }
  if (props.message.status === 'aborted') {
    return 'badge-warning'
  }
  return 'badge-success'
})
</script>
