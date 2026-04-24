<template>
  <div class="w-70%">
    <div class="chat chat-start">
      <div class="chat-bubble">{{ message.content }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Message } from '../../types'

defineProps<{
  message: Message
}>()
</script>
