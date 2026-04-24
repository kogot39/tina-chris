import { computed, ref } from 'vue'
import {
  getCurrentToolProvider,
  listToolProviders,
} from '../services/toolConfigService'

import type { CardItem, ToolProviderItem } from '../../../shared'

const toConfigPath = (toolType: string, providerKey: string) => {
  return `/setting/tools/${encodeURIComponent(toolType)}/${encodeURIComponent(providerKey)}`
}

export const useToolProviderCards = () => {
  const loading = ref(false)
  const providers = ref<ToolProviderItem[]>([])
  const currentProvider = ref('')

  const cards = computed<CardItem[]>(() => {
    return providers.value.map((provider) => ({
      title:
        provider.key === currentProvider.value
          ? `${provider.title}（当前）`
          : provider.title,
      description: provider.description,
      buttonText: '编辑配置',
      path: toConfigPath(currentToolType.value, provider.key),
    }))
  })

  const currentToolType = ref('')

  const reload = async (toolType: string) => {
    currentToolType.value = toolType
    loading.value = true
    try {
      const [nextProviders, nextCurrent] = await Promise.all([
        listToolProviders(toolType),
        getCurrentToolProvider(toolType),
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
    currentToolType,
    loading,
    providers,
    reload,
  }
}
