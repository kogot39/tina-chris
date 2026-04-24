<template>
  <FormItem
    :label="label"
    :hint="hint"
    :error="displayError"
    :required="required"
    :disabled="disabled"
  >
    <textarea
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :maxlength="maxlength"
      :disabled="disabled"
      class="textarea textarea-bordered w-full"
      :class="{ 'textarea-error': !!displayError }"
      :style="{
        resize: resize,
      }"
      @input="handleInput"
      @change="handleChange"
    />
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
    modelValue?: string
    placeholder?: string
    rows?: number
    maxlength?: number
    resize?: 'none' | 'both' | 'horizontal' | 'vertical'
  }>(),
  {
    modelValue: '',
    rows: 3,
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
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const handleChange = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('change', target.value)
}
</script>
