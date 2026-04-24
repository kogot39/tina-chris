<template>
  <div class="w-full fadeIn">
    <!-- 使用动态解析出的组件 -->
    <component
      :is="dynamicComponent"
      v-if="dynamicComponent"
      :message="props.message"
    />
    <div v-else class="text-sm text-gray-400 p-2">[暂不支持显示该类型消息]</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AgentMessage from './AgentMessage.vue'
import HumanMessage from './HumanMessage.vue'

import type { Message } from '../../types'

const props = defineProps<{
  message: Message
}>()

// 动态计算当前消息所对应的组件
const dynamicComponent = computed(() => {
  switch (props.message.role) {
    case 'agent':
      return AgentMessage
    case 'human':
      return HumanMessage
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
