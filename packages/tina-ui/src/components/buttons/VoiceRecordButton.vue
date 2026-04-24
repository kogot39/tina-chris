<template>
  <div class="tooltip tooltip-info" data-tip="录音中...">
    <button type="button" class="btn btn-square btn-primary btn-dash">
      <span class="flex h-8 w-8 items-center justify-center gap-1">
        <span
          v-for="(item, index) in bars"
          :key="index"
          class="w-1 rounded-full bg-current transition-all duration-150"
          :style="{ height: `${item}px` }"
        />
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// wave 支持单个音量值或 5 段波形数组，范围建议为 0~1
const props = defineProps<{
  wave?: number | number[]
}>()

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const bars = computed(() => {
  const input = Array.isArray(props.wave)
    ? props.wave.slice(0, 5)
    : Array.from({ length: 5 }).fill(props.wave ?? 0)

  while (input.length < 5) {
    input.push(0)
  }

  return input.map((value) => {
    const safe = typeof value === 'number' ? clamp(value) : 0
    return 6 + Math.round(safe * 18)
  })
})
</script>
