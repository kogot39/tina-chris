<template>
  <main class="h-full w-full transition-colors duration-300">
    <section class="mx-auto w-full h-full">
      <div
        class="relative w-full h-full rounded-xl border bg-transparent transition-colors duration-200 group-hover:border-primary"
        :class="isActive ? 'border-primary' : 'border-transparent'"
      >
        <div
          class="m-1 absolute z-10 transition-opacity duration-200 group-hover:opacity-100"
          :class="[
            isLeft ? 'left-0' : 'right-0',
            isActive ? 'opacity-100' : 'opacity-0',
          ]"
        >
          <div class="flex h-full w-full items-center justify-center">
            <slot name="big-btn" />
          </div>
        </div>

        <div
          class="m-1 absolute z-10 transition-opacity duration-200 group-hover:opacity-100"
          :class="[
            isLeft ? 'right-0' : 'left-0',
            isActive ? 'opacity-100' : 'opacity-0',
          ]"
        >
          <slot name="icon-btn" :need-reverse="isLeft" />
        </div>

        <div class="flex h-full w-full items-end justify-center relative z-0">
          <slot />
        </div>
      </div>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

// props 控制左右插槽位置
const props = withDefaults(
  defineProps<{
    direction?: 'left' | 'right'
    isActive: boolean
  }>(),
  {
    direction: 'right',
  }
)

const isLeft = computed(() => props.direction === 'left')
</script>
