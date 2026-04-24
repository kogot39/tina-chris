<template>
  <div class="tooltip tooltip-info" :data-tip="props.tooltip">
    <button
      type="button"
      class="btn btn-xs join-item text-lg text-primary"
      :class="activeClass"
      :aria-pressed="isActive"
      @click="toggleActive"
    >
      <slot :is-active="isActive" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    needActiveColor?: boolean
    tooltip?: string
  }>(),
  {
    needActiveColor: true,
    tooltip: '',
  }
)

const emit = defineEmits(['afterActive', 'afterDeactive'])

const isActive = ref(false)

const activeClass = computed(() =>
  props.needActiveColor && isActive.value
    ? 'btn-primary text-primary-content'
    : ''
)

const toggleActive = () => {
  isActive.value = !isActive.value
  if (isActive.value) {
    emit('afterActive')
  } else {
    emit('afterDeactive')
  }
}

defineExpose({
  toggleActive,
})
</script>
