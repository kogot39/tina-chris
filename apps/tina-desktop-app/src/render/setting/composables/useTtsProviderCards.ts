import { computed, ref } from 'vue'
import { listTTSProviders, setTTSEnabled } from '../services/ttsConfigService'

import type { CardItem, TTSProviderItem } from '../../../shared'

const toConfigPath = (providerKey: string) => {
  return `/setting/ttsprovider/${encodeURIComponent(providerKey)}`
}

const toStatusText = (provider: TTSProviderItem): string => {
  return provider.enabled ? '状态：已启用' : '状态：未启用'
}

export const useTtsProviderCards = () => {
  const loading = ref(false)
  const providers = ref<TTSProviderItem[]>([])

  const cards = computed<CardItem[]>(() => {
    return providers.value.map((provider) => ({
      title: `${provider.title} - ${toStatusText(provider)}`,
      description: provider.description,
      buttonText: '编辑配置',
      path: toConfigPath(provider.key),
      state: provider.enabled,
    }))
  })

  const reload = async () => {
    loading.value = true
    try {
      providers.value = await listTTSProviders()
    } finally {
      loading.value = false
    }
  }

  const switchProvider = async (providerKey: string, enabled: boolean) => {
    await setTTSEnabled(providerKey, enabled)
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
