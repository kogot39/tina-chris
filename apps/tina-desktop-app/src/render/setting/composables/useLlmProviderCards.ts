import { computed, ref } from 'vue'
import {
  getCurrentLLMProvider,
  listLLMProviders,
} from '../services/llmConfigService'

import type { CardItem, LLMProviderItem } from '../../../shared'

// 构造跳转到指定语言模型提供商配置页面的路径
const toConfigPath = (providerKey: string) => {
  return `/setting/llmprovider/${encodeURIComponent(providerKey)}`
}

export const useLlmProviderCards = () => {
  const loading = ref(false)
  const providers = ref<LLMProviderItem[]>([])
  const currentProvider = ref('')
  // 构造用于展示的卡片数据列表，每个提供商对应一个卡片，当前选中的提供商在标题上会有特殊标识
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
  // 从主进程加载当前的语言模型提供商列表和当前选中的提供商，并更新组件状态
  const reload = async () => {
    loading.value = true
    try {
      const [nextProviders, nextCurrent] = await Promise.all([
        listLLMProviders(),
        getCurrentLLMProvider(),
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
