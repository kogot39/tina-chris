<template>
  <div
    ref="containerRef"
    class="h-full absolute flex flex-col rounded-md pointer-events-none pb-2"
    :class="[isLeft ? 'left-4' : 'right-4', isResizing ? 'select-none' : '']"
    :style="{ width: `${modelWidth}px` }"
  >
    <section
      ref="chatAreaRef"
      class="w-full shrink-0 pointer-events-auto"
      :style="chatStyle"
    >
      <slot name="chat" />
    </section>

    <section
      ref="modelAreaRef"
      class="absolute bottom-0 group pointer-events-auto"
      :style="modelStyle"
    >
      <slot name="model" :is-resizing="isResizing">
        <slot />
      </slot>

      <button
        type="button"
        class="absolute top-0 size-4 cursor-nwse-resize border-0 opacity-0"
        :class="handlePositionClass"
        @pointerdown="onResizeStart"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import {
  useElementSize,
  useEventListener,
  useMouseInElement,
} from '@vueuse/core'

// 主要用于划分空间去展示 ChatLayout 和 ModelLayout 组件，避免它们之间的样式相互影响，
// 并提供控制左右和调整大小的功能。
const props = defineProps<{
  direction: 'left' | 'right'
  initWidth: number // 初始大小
  initHeight: number
}>()

const emit = defineEmits<{
  throughChatArea: [isOutside: boolean]
  throughModelArea: [isOutside: boolean]
  resizeStartCallback: [width: number, height: number]
  resizingCallback: [width: number, height: number]
  resizeEndCallback: [width: number, height: number]
}>()

const maxRatio = 1.4
const minRatio = 0.6

const containerRef = useTemplateRef('containerRef')
const chatAreaRef = useTemplateRef('chatAreaRef')
const modelAreaRef = useTemplateRef('modelAreaRef')
const { isOutside: isOutsideChatArea } = useMouseInElement(chatAreaRef)
const { isOutside: isOutsideModelArea } = useMouseInElement(modelAreaRef)

watch(isOutsideChatArea, (newVal) => {
  emit('throughChatArea', newVal)
})

watch(isOutsideModelArea, (newVal) => {
  emit('throughModelArea', newVal)
})

const { height: containerHeight } = useElementSize(containerRef)

const isLeft = computed(() => props.direction === 'left')
const isResizing = ref(false)

// 最小允许传入的宽度 200 px，高度为 240 px
const modelWidth = ref(200)
const modelHeight = ref(240)

watch(
  () => [props.initWidth, props.initHeight],
  () => {
    modelWidth.value = Math.max(200, props.initWidth)
    modelHeight.value = Math.max(240, props.initHeight)
  },
  { immediate: true }
)

const maxWidth = computed(() => Math.max(200, props.initWidth) * maxRatio)
const maxHeight = computed(() => Math.max(240, props.initHeight) * maxRatio)
const minWidth = computed(() => Math.max(200, props.initWidth) * minRatio)
const minHeight = computed(() => Math.max(240, props.initHeight) * minRatio)

const chatStyle = computed(() => ({
  height: `${Math.max(0, containerHeight.value - modelHeight.value)}px`,
}))

const modelStyle = computed(() => ({
  width: `${modelWidth.value}px`,
  height: `${modelHeight.value}px`,
}))

const handlePositionClass = computed(() =>
  isLeft.value
    ? 'right-0 translate-x-1/2 -translate-y-1/2 right-cursor'
    : 'left-0 -translate-x-1/2 -translate-y-1/2 left-cursor '
)
let cleanupPointerMove: (() => void) | null = null
const updateSizeByPointer = (clientX: number, clientY: number): void => {
  const el = containerRef.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  const newWidth = isLeft.value ? clientX - rect.left : rect.right - clientX
  const newHeight = rect.bottom - clientY

  modelWidth.value = Math.min(
    maxWidth.value,
    Math.max(200, Math.max(minWidth.value, newWidth))
  )
  modelHeight.value = Math.min(
    maxHeight.value,
    Math.max(240, Math.max(minHeight.value, newHeight))
  )
  emit('resizingCallback', modelWidth.value, modelHeight.value)
}

const onResizeStart = (event: PointerEvent): void => {
  event.preventDefault()
  isResizing.value = true
  emit('resizeStartCallback', modelWidth.value, modelHeight.value)
  updateSizeByPointer(event.clientX, event.clientY)
  // 注册鼠标移动事件
  cleanupPointerMove = useEventListener(
    window,
    'pointermove',
    (event: PointerEvent) => {
      if (!isResizing.value) return
      event.preventDefault()
      updateSizeByPointer(event.clientX, event.clientY)
    }
  )
}

useEventListener(window, 'pointerup', () => {
  if (isResizing.value) {
    isResizing.value = false
    emit('resizeEndCallback', modelWidth.value, modelHeight.value)
    if (cleanupPointerMove) {
      cleanupPointerMove()
      cleanupPointerMove = null
    }
  }
})
</script>

<style scoped>
.left-cursor {
  cursor: nw-resize;
}
.right-cursor {
  cursor: ne-resize;
}
</style>
