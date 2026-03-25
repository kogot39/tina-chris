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
    width?: number
    height?: number
    scale?: number
  }>(),
  {
    width: 400,
    height: 600,
    scale: 1,
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
}

const computedSize = () => {
  if (model.value) {
    const modelWidth = model.value.width / model.value.scale.x
    const modelHeight = model.value.height / model.value.scale.y
    const scaleX = (props.width * 0.9) / modelWidth
    const scaleY = (props.height * 0.9) / modelHeight
    const finalScale = Math.min(scaleX, scaleY) * props.scale

    model.value.scale.set(finalScale)
    model.value.x = props.width / 2
    model.value.y = props.height / 2
  }
}

const loadModel = async () => {
  if (!app.value || !props.modelSrc) return

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
  if (!app.value) return

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
