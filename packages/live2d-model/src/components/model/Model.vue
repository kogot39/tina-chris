<template>
  <div>
    <Render :model-src="props.modelSrc" />
  </div>
</template>

<script setup lang="ts">
// 组合组件对外可控的属性和方法
import Render from './render/Render.vue'

const props = defineProps<{
  modelSrc: string
}>()
</script>
