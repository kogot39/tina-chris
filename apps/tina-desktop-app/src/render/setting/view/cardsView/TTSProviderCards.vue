<template>
  <CardsLayout
    v-if="cards.length > 0"
    :items="cards"
    show-switch-button
    @on-switch="handleSwitch"
  />
</template>

<script setup lang="ts">
import { inject, onMounted } from 'vue'
import { CardsLayout } from '@tina-chris/tina-ui'
import { useTtsProviderCards } from '../../composables/useTtsProviderCards'

const toast = inject<any>('toast')
const { cards, reload, switchProvider } = useTtsProviderCards()

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

const handleSwitch = async (path: string, checked: boolean) => {
  const providerKey = decodeURIComponent(path.split('/').pop() || '')
  if (!providerKey) {
    toast.error?.('无效的 TTS 平台标识')
    return
  }

  try {
    await switchProvider(providerKey, checked)
    toast.success?.(checked ? '语音合成已启用。' : '语音合成已停用。')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '切换语音合成状态失败'
    toast.error?.(message)
    await loadCards()
  }
}
</script>
