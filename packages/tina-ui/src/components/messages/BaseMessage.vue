<template>
  <div class="w-full fadeIn py-1">
    <component
      :is="dynamicComponent"
      v-if="dynamicComponent"
      :message="message"
    />
    <div v-else class="alert alert-warning alert-soft text-sm">
      暂不支持显示该类型消息
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AgentMessage from './AgentMessage.vue'
import CaptureAudioMessage from './CaptureAudioMessage.vue'
import HumanMessage from './HumanMessage.vue'
import ReasoningContentMessage from './ReasoningContentMessage.vue'
import ToolMessage from './ToolMessage.vue'

import type { Message } from '../../types'
import type { Component } from 'vue'

const props = defineProps<{
  message: Message
}>()

const dynamicComponent = computed<Component | null>(() => {
  switch (props.message.type) {
    case 'user':
      return HumanMessage
    case 'assistant':
      return AgentMessage
    case 'speech_text':
      return CaptureAudioMessage
    case 'reasoning':
      return ReasoningContentMessage
    case 'tool':
      return ToolMessage
    default:
      return null
  }
})
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fadeIn {
  animation: fadeIn 0.3s ease-in-out;
}
</style>
