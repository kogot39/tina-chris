<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div
        v-if="show"
        class="toast toast-end toast-top top-12 toast-stack-item"
        :data-toast-id="toastId"
        :style="toastStyle"
        @mouseenter="keepToast"
        @mouseleave="resetDuration"
      >
        <div
          role="alert"
          class="alert alert-soft alert-horizontal"
          :class="alertClassMap[currentType]"
        >
          <iconpark-icon :name="typeMap[currentType]" />
          <span>{{ message }}</span>
          <button
            type="button"
            class="btn btn-circle btn-xs btn-link"
            :class="btnClassMap[currentType]"
            @click="closeToast"
          >
            <iconpark-icon name="close" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type ToastType = 'success' | 'error' | 'info' | 'warning'

const props = defineProps<{
  toastId?: string
  type?: ToastType
  message: string
  duration?: number
  offsetY?: number
  zIndex?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const showDuration = props.duration || 3000 // 显示时长，单位毫秒
const show = ref(false)

const timer = ref<number | null>(null)

const setDefaultTimer = () => {
  timer.value = window.setTimeout(() => {
    show.value = false
    emit('close')
    timer.value = null
  }, showDuration)
}

const keepToast = () => {
  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }
}

const resetDuration = () => {
  if (!timer.value) {
    setDefaultTimer()
  }
}

const closeToast = () => {
  show.value = false
  emit('close')
  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }
}

const typeMap = {
  success: 'check-one',
  error: 'close-one',
  info: 'info',
  warning: 'caution',
} as const

const alertClassMap: Record<ToastType, string> = {
  success: 'alert-success',
  error: 'alert-error',
  info: 'alert-info',
  warning: 'alert-warning',
}

const btnClassMap: Record<ToastType, string> = {
  success: 'btn-success',
  error: 'btn-error',
  info: 'btn-info',
  warning: 'btn-warning',
}

const currentType = computed<ToastType>(() => props.type || 'info')

const toastStyle = computed(() => {
  return {
    '--toast-offset-y': `${props.offsetY || 0}px`,
    zIndex: props.zIndex || 2000,
  }
})

onMounted(() => {
  show.value = true
  setDefaultTimer()
})
</script>

<style>
.toast-stack-item {
  transform: translateY(var(--toast-offset-y, 0px));
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition:
    transform 0.3s,
    opacity 0.3s;
}

.toast-fade-enter-to,
.toast-fade-leave-from {
  opacity: 1;
  transform: translateX(0) translateY(var(--toast-offset-y, 0px));
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(100%) translateY(var(--toast-offset-y, 0px));
}
</style>
