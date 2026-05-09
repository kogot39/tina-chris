<template>
  <CardsLayout :items="cards" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CardsLayout } from '@tina-chris/tina-ui'

const cards = ref([
  {
    title: 'Agent 配置',
    description: '管理工作目录、运行参数与提示词文档源字段',
    buttonText: '编辑 Agent',
    path: '/setting/agent',
  },
  {
    title: '大语言模型',
    description: '配置大语言模型服务',
    buttonText: '编辑 LLM',
    path: '/setting/llmprovider',
  },
  {
    title: '语音识别',
    description: '配置语音识别服务',
    buttonText: '编辑 STT',
    path: '/setting/sttprovider',
  },
  {
    title: '语音合成',
    description: '配置语音合成服务与声音复刻',
    buttonText: '编辑 TTS',
    path: '/setting/ttsprovider',
  },
  {
    title: '聊天通道',
    description: '配置 QQ 等第三方聊天工具，用于远程与 Agent 交互',
    buttonText: '管理通道',
    path: '/setting/channelprovider',
  },
])
</script>
