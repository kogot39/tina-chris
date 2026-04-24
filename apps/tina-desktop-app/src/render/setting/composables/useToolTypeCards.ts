import { computed, ref } from 'vue'
import { listToolTypes } from '../services/toolConfigService'

import type { CardItem, ToolTypeItem } from '../../../shared'

const toToolProvidersPath = (toolType: string) => {
  return `/setting/tools/${encodeURIComponent(toolType)}`
}

// 加载当前需要额外配置的工具类型列表，并构造用于展示的卡片数据列表
export const useToolTypeCards = () => {
  const loading = ref(false)
  const toolTypes = ref<ToolTypeItem[]>([])

  const cards = computed<CardItem[]>(() => {
    return toolTypes.value.map((toolType) => ({
      title: toolType.title,
      description: toolType.description,
      buttonText: '选择供应平台',
      path: toToolProvidersPath(toolType.key),
    }))
  })

  const reload = async () => {
    loading.value = true
    try {
      toolTypes.value = await listToolTypes()
    } finally {
      loading.value = false
    }
  }

  return {
    cards,
    loading,
    reload,
    toolTypes,
  }
}
