<template>
  <CardsLayout v-if="cards.length > 0" :items="cards" />
</template>

<script setup lang="ts">
import { computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CardsLayout } from '@tina-chris/tina-ui'
import { useToolProviderCards } from '../../composables/useToolProviderCards'

const toast = inject<any>('toast')
const route = useRoute()
const router = useRouter()

const toolType = computed(() => String(route.params.toolType || ''))
const { cards, reload } = useToolProviderCards()

const loadCards = async () => {
  // 根据路由参数中的工具类型标识加载对应的工具供应平台列表
  const currentToolType = toolType.value
  if (!currentToolType) {
    toast.error?.('无效的工具类型标识')
    router.replace('/setting/tools')
    return
  }

  try {
    await reload(currentToolType)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载工具供应平台列表失败'
    toast.error?.(message)
  }
}

watch(
  () => toolType.value,
  () => {
    loadCards()
  }
)

onMounted(() => {
  loadCards()
})
</script>
