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
import { useChannelProviderCards } from '../../composables/useChannelProviderCards'

const toast = inject<any>('toast')
const { cards, reload, switchProvider } = useChannelProviderCards()

const loadCards = async () => {
  try {
    await reload()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载聊天通道列表失败'
    toast.error?.(message)
  }
}

onMounted(() => {
  loadCards()
})

const handleSwitch = async (path: string, checked: boolean) => {
  const providerKey = decodeURIComponent(path.split('/').pop() || '')
  if (!providerKey) {
    toast.error?.('无效的聊天通道标识')
    return
  }

  try {
    await switchProvider(providerKey, checked)
    toast.success?.(checked ? '聊天通道已启用。' : '聊天通道已停用。')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '切换聊天通道状态失败'
    toast.error?.(message)
    await loadCards()
  }
}
</script>
