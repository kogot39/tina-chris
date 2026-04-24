<script setup lang="ts">
// 负责基础渲染相关工作
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

const props = defineProps<{
  model?: Live2DModel
  width: number
  height: number
  scale: number
  // 是否需要移入设置透明度
  needTransparentOnHover?: boolean
  // todo: 后续支持拖拽移动和缩放
  // todo: 后续支持非对话情景或交互情景下调整为较低帧数
}>()

const container = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const app = ref<Application>()
const currentModel = ref<Live2DModel>()

const initModelRenderer = async (container: HTMLDivElement) => {
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  app.value = new Application({
    width: props.width,
    height: props.height,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  canvas.value = app.value.view as HTMLCanvasElement
  container.appendChild(canvas.value)
}

const computedSize = (model: Live2DModel) => {
  if (model) {
    const modelWidth = model.width / model.scale.x
    const modelHeight = model.height / model.scale.y
    const scaleX = props.width / modelWidth
    const scaleY = props.height / modelHeight
    const finalScale = Math.min(scaleX, scaleY) * props.scale

    model.scale.set(finalScale)
    model.x = props.width / 2
    model.y = props.height / 2
  }
}

const renderModel = () => {
  if (!app.value) {
    console.error('App not initialized')
    return
  }

  if (currentModel.value) {
    app.value.stage.removeChild(currentModel.value)
    currentModel.value = undefined
  }

  if (!props.model) {
    return
  }

  currentModel.value = props.model
  // TODO: 后续设置为可调整以适配不同的模型
  currentModel.value.anchor.set(0.5, 0.5) // 根据模型调整锚点位置
  computedSize(currentModel.value)

  app.value.stage.addChild(currentModel.value)
}

const handleResize = () => {
  if (!app.value) {
    console.error('App not initialized')
    return
  }

  app.value.renderer.resize(props.width, props.height)

  if (currentModel.value) {
    computedSize(currentModel.value)
  }
}

watch(() => props.model, renderModel)
watch(() => props.width, handleResize)
watch(() => props.height, handleResize)
watch(() => props.scale, handleResize)

const handleMouseEnter = () => {
  if (canvas.value) canvas.value.style.opacity = '0'
}

const handleMouseLeave = () => {
  if (canvas.value) canvas.value.style.opacity = '1'
}

const updateHoverEffect = () => {
  if (!canvas.value) return
  if (props.needTransparentOnHover) {
    canvas.value.style.transition = 'opacity 0.3s'
    canvas.value.addEventListener('mouseenter', handleMouseEnter)
    canvas.value.addEventListener('mouseleave', handleMouseLeave)
  } else {
    canvas.value.style.transition = ''
    canvas.value.style.opacity = '1'
    canvas.value.removeEventListener('mouseenter', handleMouseEnter)
    canvas.value.removeEventListener('mouseleave', handleMouseLeave)
  }
}

watch(() => props.needTransparentOnHover, updateHoverEffect)

onMounted(async () => {
  await initModelRenderer(container.value!)
  renderModel()
  updateHoverEffect()
})

onUnmounted(() => {
  if (app.value && currentModel.value) {
    app.value.stage.removeChild(currentModel.value)
  }
  if (canvas.value) {
    canvas.value.removeEventListener('mouseenter', handleMouseEnter)
    canvas.value.removeEventListener('mouseleave', handleMouseLeave)
  }
  app.value?.destroy()
})
</script>

<template>
  <div ref="container" />
</template>

<style scoped></style>
