<template>
  <div v-if="!props.isPlaying" class="tooltip tooltip-info" data-tip="打断回复">
    <button type="button" class="btn btn-square btn-primary btn-dash text-2xl">
      <span class="flex items-center gap-1">
        <span
          class="dot-bounce h-1.5 w-1.5 rounded-full bg-current"
          style="animation-delay: -0.2s"
        />
        <span
          class="dot-bounce h-1.5 w-1.5 rounded-full bg-current"
          style="animation-delay: -0.1s"
        />
        <span class="dot-bounce h-1.5 w-1.5 rounded-full bg-current" />
      </span>
    </button>
  </div>
  <div v-else class="tooltip tooltip-info" data-tip="打断回复">
    <button
      type="button"
      class="btn btn-square btn-primary btn-dash text-2xl"
      @click="stopPlaying"
    >
      <iconpark-icon name="square-kfjjm40e" />
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  isPlaying: boolean
}>()
const emit = defineEmits<{
  (e: 'stopPlaying'): void
}>()

const stopPlaying = () => {
  emit('stopPlaying')
}
</script>

<style scoped>
@keyframes dot-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-5px);
  }
}

.dot-bounce {
  animation: dot-bounce 0.75s infinite ease-in-out;
}
</style>
