<template>
  <button class="btn" :class="buttonClass" :disabled="disabled">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  color?:
    | 'neutral'
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
  type?: 'outline' | 'dash' | 'soft' | 'ghost' | 'link'
  behavior?: 'active' | 'disabled'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'wide' | 'block' | 'square' | 'circle'
  disabled?: boolean
}>()

const prefix = 'btn-'
const buttonClass = computed(() => {
  const classes = []
  if (props.color) {
    classes.push(`${prefix}${props.color}`)
  }
  if (props.type) {
    classes.push(`${prefix}${props.type}`)
  }
  if (props.behavior) {
    classes.push(`${prefix}${props.behavior}`)
  }
  if (props.size) {
    classes.push(`${prefix}${props.size}`)
  }
  if (props.shape) {
    classes.push(`${prefix}${props.shape}`)
  }
  return classes
})
</script>
