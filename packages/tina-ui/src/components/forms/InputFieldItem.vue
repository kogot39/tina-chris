<template>
  <FormItem
    :label="label"
    :hint="hint"
    :error="displayError"
    :required="required"
  >
    <div class="relative w-full">
      <span
        v-if="prefix"
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-base-content/60 z-10"
      >
        {{ prefix }}
      </span>
      <input
        :value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        :maxlength="maxlength"
        :minlength="minlength"
        class="input input-bordered w-full"
        :class="{ 'input-error': !!displayError }"
        :style="
          prefix
            ? {
                paddingLeft: `min(calc(${Math.max(prefix.length, 1)}ch + 1.25rem), 6rem)`,
              }
            : undefined
        "
        @input="handleInput"
        @change="handleChange"
      />
    </div>
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
    type?: string
    placeholder?: string
    autocomplete?: string
    min?: number | string
    max?: number | string
    step?: number | string
    maxlength?: number
    minlength?: number
    prefix?: string
  }>(),
  {
    modelValue: '',
    type: 'text',
  }
)

const formContext = inject(formContextKey, null)

const displayError = computed(() => {
  return formContext?.getFieldError(props.name)
})

const registerToForm = () => {
  // label 为空时退回 name，确保自动 required 文案可读。
  formContext?.registerField({
    field: props.name,
    name: props.label || props.name,
    required: !!props.required,
  })
}

onMounted(() => {
  registerToForm()
})

watch(
  () => props.name,
  (newName, oldName) => {
    // 字段 key 变化时先注销旧 key，避免错误映射串字段。
    if (oldName && oldName !== newName) {
      formContext?.unregisterField(oldName)
    }
    registerToForm()
  }
)

watch(
  () => [props.label, props.required],
  () => {
    // 文案或 required 状态变化后同步刷新注册元信息。
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
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('change', target.value)
}
</script>
