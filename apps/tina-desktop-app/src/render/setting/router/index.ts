import { createRouter, createWebHashHistory } from 'vue-router'
import SettingCards from '../view/cardsView/SettingCards.vue'
import AgentConfigForm from '../view/formsView/CharacterForm.vue'
import LLMProviderCards from '../view/cardsView/LLMProviderCards.vue'
import LLMConfigForm from '../view/formsView/LLMConfigForm.vue'
import STTConfigForm from '../view/formsView/STTConfigForm.vue'
import STTProviderCards from '../view/cardsView/STTProviderCards.vue'
import TTSConfigForm from '../view/formsView/TTSConfigForm.vue'
import TTSProviderCards from '../view/cardsView/TTSProviderCards.vue'
import ToolTypeCards from '../view/cardsView/ToolTypeCards.vue'
import ToolProviderCards from '../view/cardsView/ToolProviderCards.vue'
import ToolConfigForm from '../view/formsView/ToolConfigForm.vue'

import type { BreadcrumbItem } from '../../../shared'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    breadcrumbs?: BreadcrumbItem[]
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/setting',
    },
    {
      path: '/setting',
      name: 'setting-home',
      component: SettingCards,
      meta: {
        title: '设置',
        breadcrumbs: [{ title: '设置' }],
      },
    },
    {
      path: '/setting/agent',
      name: 'setting-agent',
      component: AgentConfigForm,
      meta: {
        title: 'Agent 配置',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: 'Agent 配置' },
        ],
      },
    },
    {
      path: '/setting/character',
      redirect: '/setting/agent',
    },
    {
      path: '/setting/tools',
      name: 'setting-tools',
      component: ToolTypeCards,
      meta: {
        title: '工具配置',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '工具类型' },
        ],
      },
    },
    {
      path: '/setting/tools/:toolType',
      name: 'setting-tool-providers',
      component: ToolProviderCards,
      meta: {
        title: '工具供应平台',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '工具类型', path: '/setting/tools' },
          { title: '供应平台' },
        ],
      },
    },
    {
      path: '/setting/tools/:toolType/:providerKey',
      name: 'setting-tool-config',
      component: ToolConfigForm,
      meta: {
        title: '工具供应平台配置',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '工具类型', path: '/setting/tools' },
          { title: '供应平台' },
        ],
      },
    },
    {
      path: '/setting/llmprovider',
      name: 'setting-llmprovider',
      component: LLMProviderCards,
      meta: {
        title: 'LLM',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '支持平台' },
        ],
      },
    },
    {
      path: '/setting/llmprovider/:providerKey',
      name: 'setting-llm-config',
      component: LLMConfigForm,
      meta: {
        title: '大语言模型',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '支持平台', path: '/setting/llmprovider' },
          { title: '大语言模型' },
        ],
      },
    },
    {
      path: '/setting/sttprovider',
      name: 'setting-sttprovider',
      component: STTProviderCards,
      meta: {
        title: 'STT ',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '支持平台' },
        ],
      },
    },
    {
      path: '/setting/sttprovider/:providerKey',
      name: 'setting-stt-config',
      component: STTConfigForm,
      meta: {
        title: '语音识别',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '支持平台', path: '/setting/sttprovider' },
          { title: '语音识别' },
        ],
      },
    },
    {
      path: '/setting/ttsprovider',
      name: 'setting-ttsprovider',
      component: TTSProviderCards,
      meta: {
        title: 'TTS',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '支持平台' },
        ],
      },
    },
    {
      path: '/setting/ttsprovider/:providerKey',
      name: 'setting-tts-config',
      component: TTSConfigForm,
      meta: {
        title: '语音合成',
        breadcrumbs: [
          { title: '设置', path: '/setting' },
          { title: '支持平台', path: '/setting/ttsprovider' },
          { title: '语音合成' },
        ],
      },
    },
  ],
})

export default router
