<template>
  <CardsLayout v-if="cards.length > 0" :items="cards" />
</template>

<script setup lang="ts">
import { inject, onMounted } from 'vue'
import { CardsLayout } from '@tina-chris/tina-ui'
import { useTtsProviderCards } from '../../composables/useTtsProviderCards'

const toast = inject<any>('toast')
const { cards, reload } = useTtsProviderCards()

const loadCards = async () => {
  try {
    await reload()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载 TTS 平台列表失败'
    toast.error?.(message)
  }
}

onMounted(() => {
  loadCards()
})
</script>
