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
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    needActiveColor?: boolean
    tooltip?: string
    disabled?: boolean
  }>(),
  {
    needActiveColor: true,
    tooltip: '',
    disabled: false,
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
  if (props.disabled) return
  isActive.value = !isActive.value
  if (isActive.value) {
    emit('afterActive')
  } else {
    emit('afterDeactive')
  }
}

watch(
  () => props.disabled,
  (newVal) => {
    if (newVal) {
      isActive.value = false
      // 组件被禁用时，强制取消激活状态，并触发 afterDeactive 事件
      emit('afterDeactive')
    }
  }
)

defineExpose({
  toggleActive,
})
</script>
