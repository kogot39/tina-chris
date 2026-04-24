<template>
  <div class="w-70%">
    <div class="chat chat-end">
      <div class="chat-bubble chat-bubble-primary">{{ message.content }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../../types'

defineProps<{
  message: Message
}>()
</script>
