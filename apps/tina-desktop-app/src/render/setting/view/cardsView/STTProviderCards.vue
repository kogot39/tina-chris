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
import { useSttProviderCards } from '../../composables/useSttProviderCards'

const toast = inject<any>('toast')

const { cards, reload, switchProvider } = useSttProviderCards()

const loadCards = async () => {
  try {
    await reload()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载 STT 平台列表失败'
    toast.error?.(message)
  }
}

onMounted(() => {
  loadCards()
})

const handleSwitch = async (path: string, checked: boolean) => {
  const providerKey = decodeURIComponent(path.split('/').pop() || '')
  if (!providerKey) {
    toast.error?.('无效的 STT 平台标识')
    return
  }

  try {
    await switchProvider(providerKey, checked)
    toast.success?.(checked ? '语音识别已启用。' : '语音识别已停用。')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '切换语音识别状态失败'
    toast.error?.(message)
    await loadCards()
  }
}
</script>
