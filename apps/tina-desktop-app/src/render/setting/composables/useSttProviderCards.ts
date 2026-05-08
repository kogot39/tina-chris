import { computed, ref } from 'vue'
import { listSTTProviders, setSTTEnabled } from '../services/sttConfigService'

import type { CardItem, STTProviderItem } from '../../../shared'

const toConfigPath = (providerKey: string) => {
  return `/setting/sttprovider/${encodeURIComponent(providerKey)}`
}

const toStatusText = (provider: STTProviderItem): string => {
  return provider.enabled ? '状态：已启用' : '状态：未启用'
}

export const useSttProviderCards = () => {
  const loading = ref(false)
  const providers = ref<STTProviderItem[]>([])

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
      providers.value = await listSTTProviders()
    } finally {
      loading.value = false
    }
  }

  const switchProvider = async (providerKey: string, enabled: boolean) => {
    await setSTTEnabled(providerKey, enabled)
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
