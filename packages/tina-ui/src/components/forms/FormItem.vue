<template>
  <div class="flex flex-col gap-2" :class="{ 'opacity-70': disabled }">
    <label v-if="label" class="label text-sm text-accent-content">
      <span v-if="required" class="ml-1 text-error">*</span>
      {{ label }}
    </label>
    <slot />
    <p
      v-if="hint || error"
      class="label"
      :class="error ? 'text-error' : 'text-base-content/70'"
    >
      {{ error || hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
}>()
</script>
