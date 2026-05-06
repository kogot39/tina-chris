<template>
  <div class="chat chat-end w-full">
    <div
      class="chat-bubble chat-bubble-primary max-w-[85%] whitespace-pre-wrap wrap-break-word"
    >
      {{ message.content || '空消息' }}
    </div>
    <div v-if="message.status === 'pending'" class="chat-footer opacity-70">
      <span class="loading loading-dots loading-xs" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserMessage } from '../../types'

defineProps<{
  message: UserMessage
}>()
</script>
