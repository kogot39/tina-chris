<script setup lang="ts">
import { ref } from 'vue'
import { Model } from '@tina-chris/live2d-model'

const modelUrl = ref('/whitecat/whitecat.model3.json')
const windowWidth = ref(400)
const windowHeight = ref(600)
const isPaused = ref(false)
</script>

<template>
  <div>
    <div>
      <Model
        :model-src="modelUrl"
        :width="windowWidth"
        :height="windowHeight - 32"
        :paused="isPaused"
      />
    </div>
  </div>
</template>

<style>
body {
  overflow: hidden;
  app-region: drag;
}
button {
  app-region: no-drag;
}
.titlebar {
  user-select: none;
  app-region: drag;
}
</style>
