<template>
  <div class="flex flex-col w-full h-full overflow-hidden">
    <TopBar
      class="draggable"
      icon="../favicon.ico"
      :items="breadcrumbItems"
      :can-back="canBack"
      @hide="hideWindow"
      @close="closeWindow"
      @back="goBack"
    />
    <main class="w-full flex-1 no-drag overflow-y-scroll overflow-x-hidden">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TopBar } from '@tina-chris/tina-ui'

const route = useRoute()
const router = useRouter()

// 自定义窗口顶部按钮，通过调用预加载脚本暴露的 API 来控制窗口行为
const hideWindow = () => {
  window.electronAPI.minimizeSettingWindow()
}

const closeWindow = () => {
  window.electronAPI.closeSettingWindow()
}

// 面包屑导航项，优先使用路由元信息中的 breadcrumbs 字段，如果没有则根据 matched 路由自动生成
const breadcrumbItems = computed(() => {
  const fromMeta = route.meta.breadcrumbs
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta
  }

  const fallback = route.matched
    .filter((item) => typeof item.meta.title === 'string')
    .map((item, index, arr) => ({
      title: item.meta.title as string,
      path: index < arr.length - 1 ? item.path : undefined,
    }))

  return fallback.length > 0 ? fallback : [{ title: '设置', path: '/setting' }]
})

// 返回功能
const canBack = computed(() => route.path !== '/setting')

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push('/setting')
}
</script>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

.draggable {
  -webkit-app-region: drag;
}

.draggable button,
.draggable li {
  -webkit-app-region: no-drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
