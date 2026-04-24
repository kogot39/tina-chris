<template>
  <FormItem
    :label="label"
    :hint="hint"
    :error="displayError"
    :required="required"
    :disabled="disabled"
  >
    <select
      :value="selectedValue"
      :disabled="disabled"
      class="select select-bordered w-full"
      :class="{ 'select-error': !!displayError }"
      @change="handleChange"
    >
      <option v-if="placeholder" value="" disabled>
        {{ placeholder }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
  </FormItem>
</template>

<script setup lang="ts" generic="TOption extends SelectOption = SelectOption">
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'
import FormItem from './FormItem.vue'
import { formContextKey } from './formContext'

export type SelectOption = {
  label: string
  value: string
  disabled?: boolean
  [key: string]: unknown
}

const props = defineProps<{
  name: string
  label?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  modelValue?: string
  // 保持对 :value 手动操作的兼容性
  value?: string
  placeholder?: string
  options: TOption[]
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
  (e: 'update:modelValue', value: string): void
  (e: 'update:value', value: string): void
  (e: 'change', value: string, option: TOption | undefined): void
}>()

const selectedValue = computed(() => {
  // 优先使用 modelValue，其次是 value，保持兼容性
  return props.modelValue ?? props.value ?? ''
})

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const value = target.value
  const nextOption = props.options.find((option) => option.value === value)
  emit('update:modelValue', value)
  emit('update:value', value)
  emit('change', value, nextOption)
}
</script>
