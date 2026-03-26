<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Model } from '@tina-chris/live2d-model'
import { WinLayout } from '@tina-chris/tina-ui'

const modelUrl = ref('/whitecat/whitecat.model3.json')

// 动态控制窗口大小
const petWidth = ref(400)
const petHeight = ref(600)
const isPaused = ref(false)

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
    :style="{
      width: petWidth + 'px',
      height: petHeight + 'px',
      right: 0,
      bottom: 0,
      position: 'absolute',
    }"
    @mouseenter="enableInteraction"
    @mouseleave="disableInteraction"
  >
    <WinLayout>
      <Model
        :model-src="modelUrl"
        :width="petWidth"
        :height="petHeight - 32"
        :paused="isPaused"
      />
    </WinLayout>
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
