<template>
  <div class="chat chat-end w-full">
    <div class="chat-header">
      <span class="badge badge-info badge-sm">语音转文字</span>
    </div>
    <div
      class="chat-bubble max-w-[85%] border border-info/30 bg-base-100 text-base-content whitespace-pre-wrap wrap-break-word"
    >
      {{ message.content }}
      <span
        v-if="message.status === 'streaming'"
        class="loading loading-dots loading-xs ml-1 align-middle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SpeechTextMessage } from '../../types'

defineProps<{
  message: SpeechTextMessage
}>()
</script>
