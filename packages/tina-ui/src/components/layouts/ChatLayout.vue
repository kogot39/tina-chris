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
        <div class="tooltip tooltip-left tooltip-warning" data-tip="关闭窗口">
          <button
            class="btn btn-square btn-xs btn-ghost btn-warning text-lg"
            @click="emits('closeCallback')"
          >
            <iconpark-icon name="close" />
          </button>
        </div>
      </div>
    </div>
    <!-- 消息区 -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-2"
      @scroll="handleMessagesScroll"
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
        :disabled="disableInput"
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
import { nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { BaseMessage } from '../messages'

import type { Message } from '../../types'

const props = defineProps<{
  messages: Message[]
  hasMore?: boolean
  loadingMore?: boolean
  disableInput?: boolean
}>()

const emits = defineEmits<{
  sendMessage: [content: string]
  plusCallback: []
  loadMore: []
  'focus-change': [focused: boolean]
  'composing-change': [composing: boolean]
  closeCallback: []
}>()
const messagesContainerRef = useTemplateRef('messagesContainerRef')
const inputContent = ref('')
const pendingPrependScrollHeight = ref<number | null>(null)
const shouldStickToBottom = ref(true)

const scrollToBottom = () => {
  const container = messagesContainerRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}

const restoreScrollAfterPrepend = () => {
  const container = messagesContainerRef.value
  const previousScrollHeight = pendingPrependScrollHeight.value
  if (!container || previousScrollHeight === null) {
    return false
  }

  // prepend 历史消息后 scrollHeight 会变大。把新增高度补回 scrollTop，
  // 用户视野就会停在原来的第一条可见消息附近，不会被顶到最旧消息开头。
  container.scrollTop = container.scrollHeight - previousScrollHeight
  pendingPrependScrollHeight.value = null
  return true
}

watch(
  () => props.messages,
  async () => {
    await nextTick()
    if (restoreScrollAfterPrepend()) {
      return
    }

    if (shouldStickToBottom.value) {
      scrollToBottom()
    }
  },
  { deep: true }
)

watch(
  () => props.loadingMore,
  async (loading) => {
    if (!loading && pendingPrependScrollHeight.value !== null) {
      await nextTick()
      restoreScrollAfterPrepend()
    }
  }
)

const handleMessagesScroll = () => {
  const container = messagesContainerRef.value
  if (!container) return

  shouldStickToBottom.value =
    container.scrollHeight - container.scrollTop - container.clientHeight < 48

  if (
    container.scrollTop <= 8 &&
    props.hasMore &&
    !props.loadingMore &&
    pendingPrependScrollHeight.value === null
  ) {
    pendingPrependScrollHeight.value = container.scrollHeight
    emits('loadMore')
  }
}

onMounted(async () => {
  await nextTick()
  scrollToBottom()
})

const handleSendMessage = () => {
  if (inputContent.value.trim() === '') return
  emits('sendMessage', inputContent.value.trim())
  inputContent.value = ''
}
</script>
