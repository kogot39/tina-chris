<template>
  <div class="join" :dir="needReverse ? 'rtl' : 'ltr'">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    needReverse?: boolean
  }>(),
  {
    needReverse: false,
  }
)
</script>
