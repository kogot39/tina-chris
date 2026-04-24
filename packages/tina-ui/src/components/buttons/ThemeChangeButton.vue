<template>
  <label class="flex cursor-pointer gap-2">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <path
        d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
      />
    </svg>
    <input
      v-model="isDark"
      type="checkbox"
      class="toggle theme-controller"
      aria-label="切换明暗主题"
      @change="themeChange(isDark)"
    />
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </label>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const emit = defineEmits(['changeCallback'])

const STORAGE_KEY = 'tina-ui-theme'
// 对应布尔值：true -> dark 主题，false -> light 主题
const LIGHT_THEME = 'cmyk'
const DARK_THEME = 'night'

const getInitialTheme = (): string => {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === LIGHT_THEME || stored === DARK_THEME) {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? DARK_THEME
    : LIGHT_THEME
}

const isDark = ref(getInitialTheme() === DARK_THEME)

watch(
  isDark,
  (value) => {
    const theme = value ? DARK_THEME : LIGHT_THEME
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(STORAGE_KEY, theme)
  },
  { immediate: true }
)

const themeChange = (value: boolean) => {
  // 修改主题触发回调，并传入当前主题和对应的布尔值
  const theme = value ? DARK_THEME : LIGHT_THEME
  emit('changeCallback', theme, value)
}
</script>
