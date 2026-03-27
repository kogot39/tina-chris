<script setup lang="ts">
// 负责基础渲染相关工作
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

const props = withDefaults(
  defineProps<{
    modelSrc: string
    width: number
    height: number
    scale?: number
    // 是否需要移入设置透明度
    needTransparentOnHover?: boolean
    // todo: 后续支持拖拽移动和缩放
    // todo: 后续支持非对话情景或交互情景下调整为较低帧数
  }>(),
  {
    scale: 1,
    needTransparentOnHover: true,
  }
)

const container = ref<HTMLDivElement>()
const model = ref<Live2DModel>()
const app = ref<Application>()

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

  const canvas = app.value.view as HTMLCanvasElement
  container.appendChild(canvas)
  // 鼠标移入时设置透明度0.4来避免遮挡用户操作
  if (props.needTransparentOnHover) {
    canvas.style.transition = 'opacity 0.3s'
    canvas.addEventListener('mouseenter', () => {
      canvas.style.opacity = '0.4'
    })
    canvas.addEventListener('mouseleave', () => {
      canvas.style.opacity = '1'
    })
  }
}

const computedSize = () => {
  if (model.value) {
    const modelWidth = model.value.width / model.value.scale.x
    const modelHeight = model.value.height / model.value.scale.y
    const scaleX = props.width / modelWidth
    const scaleY = props.height / modelHeight
    const finalScale = Math.min(scaleX, scaleY) * props.scale

    model.value.scale.set(finalScale)
    model.value.x = props.width / 2
    model.value.y = props.height / 2
  }
}

const loadModel = async () => {
  if (!app.value || !props.modelSrc) {
    console.error('App not initialized or modelSrc is empty')
    return
  }

  if (model.value) {
    app.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }

  model.value = await Live2DModel.from(props.modelSrc, { autoInteract: false })

  computedSize()
  model.value.anchor.set(0.5, 0.5)

  app.value.stage.addChild(model.value)
}

const handleResize = () => {
  if (!app.value) {
    console.error('App not initialized')
    return
  }

  app.value.renderer.resize(props.width, props.height)

  computedSize()
}

watch(() => props.modelSrc, loadModel)
watch(() => props.width, handleResize)
watch(() => props.height, handleResize)
watch(() => props.scale, handleResize)

onMounted(async () => {
  await initModelRenderer(container.value!)
  await loadModel()
})

onUnmounted(() => {
  model.value?.destroy()
  app.value?.destroy()
})
</script>

<template>
  <div ref="container" />
</template>

<style scoped></style>
