<template>
  <FormItem
    :label="label"
    :hint="hint"
    :error="displayError"
    :required="required"
    :disabled="disabled"
  >
    <label
      class="flex w-full items-center justify-between rounded-box border border-base-300 px-3 py-2"
      :class="{ 'opacity-70': disabled }"
    >
      <span class="text-sm">{{ currentText }}</span>
      <input
        :checked="modelValue"
        type="checkbox"
        class="toggle toggle-primary"
        :disabled="disabled"
        @change="handleChange"
      />
    </label>
  </FormItem>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'
import FormItem from './FormItem.vue'
import { formContextKey } from './formContext'

const props = withDefaults(
  defineProps<{
    name: string
    label?: string
    hint?: string
    required?: boolean
    disabled?: boolean
    modelValue?: boolean
    checkedText?: string
    uncheckedText?: string
  }>(),
  {
    modelValue: false,
    checkedText: '已开启',
    uncheckedText: '已关闭',
  }
)

const formContext = inject(formContextKey, null)

const displayError = computed(() => {
  return formContext?.getFieldError(props.name)
})

const registerToForm = () => {
  formContext?.registerField({
    field: props.name,
    name: props.label || props.name,
    required: !!props.required,
  })
}

onMounted(registerToForm)

watch(
  () => props.name,
  (newName, oldName) => {
    if (oldName && oldName !== newName) {
      formContext?.unregisterField(oldName)
    }
    registerToForm()
  }
)

watch(
  () => [props.label, props.required],
  () => {
    registerToForm()
  }
)

onBeforeUnmount(() => {
  formContext?.unregisterField(props.name)
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

const currentText = computed(() =>
  props.modelValue ? props.checkedText : props.uncheckedText
)

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.checked)
  emit('change', target.checked)
}
</script>
