<template>
  <CardsLayout v-if="cards.length > 0" :items="cards" />
</template>

<script setup lang="ts">
import { inject, onMounted } from 'vue'
import { CardsLayout } from '@tina-chris/tina-ui'
import { useToolTypeCards } from '../../composables/useToolTypeCards'

const toast = inject<any>('toast')
const { cards, reload } = useToolTypeCards()

const loadCards = async () => {
  try {
    await reload()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载工具类型列表失败'
    toast.error?.(message)
  }
}

onMounted(() => {
  loadCards()
})
</script>
