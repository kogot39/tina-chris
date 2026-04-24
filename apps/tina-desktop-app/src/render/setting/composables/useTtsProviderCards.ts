import { computed, ref } from 'vue'
import {
  getCurrentTTSProvider,
  listTTSProviders,
} from '../services/ttsConfigService'

import type { CardItem, TTSProviderItem } from '../../../shared'

const toConfigPath = (providerKey: string) => {
  return `/setting/ttsprovider/${encodeURIComponent(providerKey)}`
}

export const useTtsProviderCards = () => {
  const loading = ref(false)
  const providers = ref<TTSProviderItem[]>([])
  const currentProvider = ref('')

  const cards = computed<CardItem[]>(() => {
    return providers.value.map((provider) => ({
      title:
        provider.key === currentProvider.value
          ? `${provider.title}（当前）`
          : provider.title,
      description: provider.description,
      buttonText: '编辑配置',
      path: toConfigPath(provider.key),
    }))
  })

  const reload = async () => {
    loading.value = true
    try {
      const [nextProviders, nextCurrent] = await Promise.all([
        listTTSProviders(),
        getCurrentTTSProvider(),
      ])

      providers.value = nextProviders
      currentProvider.value = nextCurrent || ''
    } finally {
      loading.value = false
    }
  }

  return {
    cards,
    currentProvider,
    loading,
    providers,
    reload,
  }
}
