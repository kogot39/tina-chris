<template>
  <div class="flex flex-col justify-end gap-2 w-full h-full">
    <div
      class="w-full h-8 flex items-center justify-between rounded-md bg-base-100 text-sm px-2"
    >
      <span class="text-primary">Chat Messages</span>
      <div class="flex gap-1">
        <div class="tooltip tooltip-left tooltip-info" data-tip="新话题">
          <button
            class="btn btn-square btn-xs btn-ghost btn-primary text-lg"
            @click="emits('plusCallback')"
          >
            <iconpark-icon name="plus" />
          </button>
        </div>
        <!-- <button
          class="btn btn-square btn-xs btn-ghost btn-primary"
          @click="emits('closeCallback')"
        >
          <iconpark-icon name="close" />
        </button> -->
      </div>
    </div>
    <!-- 消息区 -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-2"
    >
      <BaseMessage
        v-for="message in props.messages"
        :key="message.id"
        :message="message"
      />
    </div>
    <div class="w-full px-2">
      <textarea
        v-model="inputContent"
        placeholder="文本也能聊天哦~"
        class="textarea textarea-primary resize-none w-full"
        @focus="emits('focus-change', true)"
        @blur="emits('focus-change', false)"
        @compositionstart="emits('composing-change', true)"
        @compositionend="emits('composing-change', false)"
        @keyup.enter="handleSendMessage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import { BaseMessage } from '../messages'

import type { Message } from '../../types'

const props = defineProps<{
  messages: Message[]
}>()

const emits = defineEmits<{
  sendMessage: [content: string]
  plusCallback: []
  'focus-change': [focused: boolean]
  'composing-change': [composing: boolean]
  // closeCallback: []
}>()
const messagesContainerRef = useTemplateRef('messagesContainerRef')
const inputContent = ref('')
watch(
  () => props.messages,
  () => {
    // 每当消息列表更新时，自动滚动到底部
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop =
        messagesContainerRef.value.scrollHeight
    }
  },
  { deep: true }
)

const handleSendMessage = () => {
  if (inputContent.value.trim() === '') return
  emits('sendMessage', inputContent.value.trim())
  inputContent.value = ''
}
</script>
