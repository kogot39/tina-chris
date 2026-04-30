import { computed, ref } from 'vue'
import {
  listChannelProviders,
  setChannelEnabled,
} from '../services/channelConfigService'

import type { CardItem, ChannelProviderItem } from '../../../shared'

const toConfigPath = (providerKey: string) => {
  return `/setting/channelprovider/${encodeURIComponent(providerKey)}`
}

const toStatusText = (provider: ChannelProviderItem): string => {
  if (!provider.enabled) {
    return '状态：未启用'
  }

  return provider.connected ? '状态：已连接' : '状态：未连接'
}

export const useChannelProviderCards = () => {
  const loading = ref(false)
  const providers = ref<ChannelProviderItem[]>([])

  const cards = computed<CardItem[]>(() => {
    return providers.value.map((provider) => ({
      title: provider.title,
      description: [provider.description, toStatusText(provider)].join('\n'),
      buttonText: '编辑配置',
      path: toConfigPath(provider.key),
      state: provider.enabled,
    }))
  })

  const reload = async () => {
    loading.value = true
    try {
      providers.value = await listChannelProviders()
    } finally {
      loading.value = false
    }
  }

  const switchProvider = async (providerKey: string, enabled: boolean) => {
    await setChannelEnabled(providerKey, enabled)
    await reload()
  }

  return {
    cards,
    loading,
    providers,
    reload,
    switchProvider,
  }
}
