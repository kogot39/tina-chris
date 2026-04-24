<template>
  <FormItem
    :label="label"
    :hint="displayHint"
    :error="displayError"
    :required="required"
  >
    <input
      type="file"
      class="file-input w-full"
      :class="{ 'file-input-error': !!displayError }"
      :accept="accept"
      :disabled="disabled"
      @change="handleChange"
    />
  </FormItem>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'
import FormItem from './FormItem.vue'
import { formContextKey } from './formContext'

const props = defineProps<{
  name: string
  label?: string
  hint?: string
  placeholder?: string
  accept?: string
  required?: boolean
  disabled?: boolean
  modelValue?: File | null
}>()

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
  (e: 'update:modelValue', file: File | null): void
  (e: 'change', file: File | null): void
}>()

const displayHint = computed(() => {
  if (props.modelValue?.name) {
    return props.modelValue.name
  }
  return props.hint || props.placeholder
})

const handleChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0] || null
  emit('update:modelValue', file)
  emit('change', file)
}
</script>
