<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <dialog
        v-if="visible"
        ref="dialogRef"
        class="modal"
        :class="placementClass"
        :style="dialogStyle"
        @cancel.prevent="handleCancel"
      >
        <div class="modal-box" :style="boxStyle">
          <h3 v-if="title" class="text-lg font-bold">{{ title }}</h3>
          <div class="py-4">{{ content }}</div>
          <div v-if="showActions" class="modal-action">
            <button
              v-if="showCancel"
              type="button"
              class="btn btn-ghost"
              @click="handleCancel"
            >
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="handleConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
        <form
          v-if="closeOnBackdrop"
          method="dialog"
          class="modal-backdrop"
          @submit.prevent="handleBackdrop"
        >
          <button type="submit">close</button>
        </form>
      </dialog>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

export type ModalPlacement = 'top' | 'middle' | 'bottom' | 'start' | 'end'
export type ModalCloseReason =
  | 'confirm'
  | 'cancel'
  | 'backdrop'
  | 'programmatic'

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    content?: string
    width?: string | number
    height?: string | number
    placement?: ModalPlacement
    zIndex?: number
    closeOnBackdrop?: boolean
    showActions?: boolean
    showCancel?: boolean
    confirmText?: string
    cancelText?: string
  }>(),
  {
    placement: 'middle',
    zIndex: 3000,
    closeOnBackdrop: true,
    showActions: true,
    showCancel: true,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  }
)

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'close', reason: ModalCloseReason): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)

const placementClassMap: Record<ModalPlacement, string> = {
  top: 'modal-top',
  middle: 'modal-middle',
  bottom: 'modal-bottom',
  start: 'modal-start',
  end: 'modal-end',
}

const placementClass = computed(() => placementClassMap[props.placement])

const toCssSize = (value?: string | number) => {
  if (typeof value === 'number') {
    return `${value}px`
  }
  return value
}

const boxStyle = computed(() => {
  return {
    width: toCssSize(props.width),
    height: toCssSize(props.height),
  }
})

const dialogStyle = computed(() => {
  return {
    zIndex: props.zIndex,
  }
})

const requestClose = (reason: ModalCloseReason) => {
  emit('close', reason)
  emit('update:visible', false)
}

const handleConfirm = () => {
  emit('confirm')
  requestClose('confirm')
}

const handleCancel = () => {
  emit('cancel')
  requestClose('cancel')
}

const handleBackdrop = () => {
  requestClose('backdrop')
}

watch(
  () => props.visible,
  async (value) => {
    await nextTick()
    const dialog = dialogRef.value
    if (!dialog) return

    if (value && !dialog.open) {
      dialog.showModal()
      return
    }

    if (!value && dialog.open) {
      dialog.close()
    }
  },
  { immediate: true }
)

watch(
  () => dialogRef.value,
  (dialog) => {
    if (!dialog || !props.visible || dialog.open) return
    dialog.showModal()
  }
)

defineExpose({
  requestClose,
})
</script>

<style>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.modal-fade-enter-to,
.modal-fade-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
