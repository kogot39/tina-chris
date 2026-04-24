import { computed, ref } from 'vue'
import {
  getCurrentSTTProvider,
  listSTTProviders,
} from '../services/sttConfigService'

import type { CardItem, STTProviderItem } from '../../../shared'

const toConfigPath = (providerKey: string) => {
  return `/setting/sttprovider/${encodeURIComponent(providerKey)}`
}

export const useSttProviderCards = () => {
  const loading = ref(false)
  const providers = ref<STTProviderItem[]>([])
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
        listSTTProviders(),
        getCurrentSTTProvider(),
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
