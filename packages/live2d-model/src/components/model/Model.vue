<template>
  <div>
    <Render
      :model="model"
      :width="props.width"
      :height="props.height"
      :scale="props.scale"
      :need-transparent-on-hover="needTransparentOnHover"
    />
  </div>
</template>

<script setup lang="ts">
// 负责加载模型，组合渲染与模型交互逻辑
import { onUnmounted, ref, watch } from 'vue'
import Render from './render/Render.vue'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

const props = withDefaults(
  defineProps<{
    modelSrc: string
    width: number
    height: number
    scale?: number
    needTransparentOnHover?: boolean
  }>(),
  {
    scale: 1,
    needTransparentOnHover: true,
  }
)

const model = ref<Live2DModel>()
let loadSeq = 0

const destroyModel = () => {
  if (!model.value) {
    return
  }
  model.value.destroy()
  model.value = undefined
}

const loadModel = async () => {
  const currentSeq = ++loadSeq

  if (!props.modelSrc) {
    console.error('modelSrc is empty')
    destroyModel()
    return
  }

  destroyModel()
  const nextModel = await Live2DModel.from(props.modelSrc, {
    autoInteract: false,
  })

  if (currentSeq !== loadSeq) {
    nextModel.destroy()
    return
  }

  model.value = nextModel
}

watch(
  () => props.modelSrc,
  () => {
    loadModel()
  },
  { immediate: true }
)

onUnmounted(() => {
  destroyModel()
})
</script>
