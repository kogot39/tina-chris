<template>
  <div
    class="card w-full bg-base-100 card-sm shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
  >
    <div class="card-body">
      <h2 class="card-title text-xl">
        {{ title }}
      </h2>
      <p class="text-lg">
        {{ description }}
      </p>
      <div class="justify-end card-actions">
        <button class="btn btn-primary btn-soft" @click="emit('toPage')">
          {{ buttonText }}
          <iconpark-icon name="arrow-right" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  buttonText?: string
}>()

const emit = defineEmits<{
  toPage: []
}>()
</script>
