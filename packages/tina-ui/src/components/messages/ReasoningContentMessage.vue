<template>
  <details
    class="collapse collapse-arrow border border-base-300 bg-base-100 w-[85%]"
    :open="message.status === 'streaming'"
  >
    <summary class="collapse-title min-h-0 py-2 text-sm">
      <span class="badge badge-accent badge-sm mr-2">深度思考</span>
      <span v-if="message.status === 'streaming'" class="align-middle">
        <span class="loading loading-dots loading-xs" />
      </span>
      <span
        v-else-if="message.status === 'aborted'"
        class="text-base-content/60"
      >
        已中止
      </span>
      <span v-else class="text-base-content/60">查看推理过程</span>
    </summary>
    <div class="collapse-content text-sm">
      <div
        v-if="message.content"
        class="message-markdown text-base-content/80"
        v-html="renderedContent"
      />
      <div v-else class="text-base-content/60">暂无思考内容</div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from './markdown'

import type { ReasoningMessage } from '../../types'

const props = defineProps<{
  message: ReasoningMessage
}>()
const renderedContent = computed(() => renderMarkdown(props.message.content))
</script>

<style scoped>
.message-markdown :deep(p) {
  margin: 0 0 0.5rem;
}

.message-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.message-markdown :deep(ul),
.message-markdown :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
}

.message-markdown :deep(ul) {
  list-style: disc;
}

.message-markdown :deep(ol) {
  list-style: decimal;
}

.message-markdown :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 0.5rem;
  background: var(--color-base-200);
  padding: 0.75rem;
  font-size: 0.75rem;
}

.message-markdown :deep(code) {
  border-radius: 0.25rem;
  background: var(--color-base-200);
  padding: 0.1rem 0.25rem;
  font-size: 0.875em;
}

.message-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}

.message-markdown :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
}
</style>
