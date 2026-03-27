<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'
import { Model } from '@tina-chris/live2d-model'
import { WinLayout } from '@tina-chris/tina-ui'
import { useResizeObserver } from '@vueuse/core'

const modelUrl = ref('/whitecat/whitecat.model3.json')

// 动态控制窗口大小
const petWidth = ref(0)
const petHeight = ref(0)
const windowRef = useTemplateRef<HTMLDivElement>('windowRef')
useResizeObserver(windowRef, (entries) => {
  const { width, height } = entries[0].contentRect
  // 宽度占0.2，高度占0.4
  petWidth.value = width * 0.2
  petHeight.value = height * 0.4
})
onMounted(() => {
  window.electronAPI.setClickThrough(true)
  window.electronAPI.setAlwaysOnTop(true)
})

function enableInteraction(): void {
  window.electronAPI.setClickThrough(false)
}

function disableInteraction(): void {
  window.electronAPI.setClickThrough(true)
}
</script>

<template>
  <div
    ref="windowRef"
    style="width: 100%; height: 100%; position: relative; overflow: hidden"
  >
    <!-- 对话气泡 -->
    <div />
    <div
      :style="{
        width: petWidth + 'px',
        height: petHeight + 'px',
        right: 0,
        bottom: 0,
        position: 'absolute',
      }"
    >
      <WinLayout>
        <!-- 左上按钮插槽top-left -->
        <slot name="dialog">
          <div
            @mouseenter="enableInteraction"
            @mouseleave="disableInteraction"
          />
        </slot>
        <!-- 右上按钮插槽top-right -->
        <slot name="top-right">
          <div
            @mouseenter="enableInteraction"
            @mouseleave="disableInteraction"
          />
        </slot>
        <Model
          :model-src="modelUrl"
          :width="petWidth"
          :height="petHeight - 32"
        />
      </WinLayout>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent !important;
}
</style>
