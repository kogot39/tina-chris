<template>
  <FormItem
    :label="label"
    :hint="hint"
    :error="displayError"
    :required="required"
    :disabled="disabled"
  >
    <label class="label cursor-pointer justify-start gap-3 rounded-box px-1">
      <input
        :checked="modelValue"
        type="checkbox"
        class="checkbox checkbox-primary"
        :disabled="disabled"
        @change="handleChange"
      />
      <span class="label-text">{{ text }}</span>
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
    text?: string
    modelValue?: boolean
  }>(),
  {
    text: '我已阅读并同意',
    modelValue: false,
  }
)

const formContext = inject(formContextKey, null)

const displayError = computed(() => {
  return formContext?.getFieldError(props.name)
})

const registerToForm = () => {
  // 供 Form 侧自动 required 规则与默认文案使用。
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
    // name 变化时清理旧字段映射，避免保留脏错误状态。
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

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.checked)
  emit('change', target.checked)
}
</script>
