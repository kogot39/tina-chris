<template>
  <div>
    <Render
      :model-src="props.modelSrc"
      :width="props.width"
      :height="props.height"
      :scale="props.scale"
    />
  </div>
</template>

<script setup lang="ts">
// 负责加载模型，组合渲染与模型交互逻辑
import Render from './render/Render.vue'

const props = withDefaults(
  defineProps<{
    modelSrc: string
    width: number
    height: number
    scale?: number
  }>(),
  {
    scale: 1,
  }
)
</script>
