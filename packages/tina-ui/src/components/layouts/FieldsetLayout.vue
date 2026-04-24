<template>
  <Transition name="fieldset" appear>
    <div class="flex h-full w-full flex-col p-2">
      <div class="flex-1 overflow-y-auto px-2 flex flex-col">
        <slot />
      </div>

      <div v-if="showActions" class="flex justify-end pt-2">
        <slot name="actions" :="{ saving, disabled }">
          <button
            class="btn btn-primary btn-soft min-w-24"
            :disabled="disabled || saving"
            @click="emit('save')"
          >
            <span v-if="saving" class="loading loading-spinner" />
            {{ saveText }}
          </button>
        </slot>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    saveText?: string
    saving?: boolean
    disabled?: boolean
    showActions?: boolean
  }>(),
  {
    saveText: '保存',
    saving: false,
    disabled: false,
    showActions: true,
  }
)

const emit = defineEmits<{
  save: []
}>()
</script>

<style scoped>
.fieldset-enter-active {
  animation: slideInRight 0.4s ease-out forwards;
}

.fieldset-leave-active {
  animation: slideOutRight 0.4s ease-in forwards;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(-30px);
  }
}
</style>
