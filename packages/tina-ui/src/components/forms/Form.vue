<template>
  <form class="w-full" @submit.prevent="handleSubmit">
    <fieldset
      class="fieldset w-full h-full grid grid-cols-2 gap-4"
      :disabled="props.disabled"
    >
      <!-- 分块标题 -->
      <legend v-if="!!props.legend" class="fieldset-legend text-lg">
        {{ props.legend }}
      </legend>
      <!-- 表单内容 -->
      <slot />
    </fieldset>
  </form>
</template>

<script setup lang="ts">
import { onBeforeUnmount, provide, reactive, watch } from 'vue'
import { type FormFieldMeta, formContextKey } from './formContext'

import type { FormValidationErrors } from '../../utils/form'

type FormValues = Record<string, unknown>

// 组件层只依赖运行时能力，不强绑定具体 TValues，
// 这样 Form 可以接收 createFormValidator<具体表单类型>() 的返回值。
type FormValidatorLike = {
  validate: (values: any) => Promise<{
    valid: boolean
    errors: Record<string, string[] | undefined>
  }>
  validateField: (field: any, values: any) => Promise<string[]>
  hasRuleType: (field: any, type: 'required') => boolean
  clearErrors?: () => void
  subscribeValidation?: (listener: (event: any) => void) => () => void
}

// 校验结果事件结构
type FormSubmitResult = {
  valid: boolean
  errors: FormValidationErrors<FormValues>
}

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    values?: FormValues
    validator?: FormValidatorLike
    // validateOnSubmit=true 时，提交时先执行 validate，再抛出 submit 事件和校验结果
    // 否则直接抛出 submit 事件，由业务方自行调用 validator.validate()。
    validateOnSubmit?: boolean
    legend?: string
  }>(),
  {
    disabled: false,
    // 默认手动模式。
    validateOnSubmit: false,
  }
)

const emit = defineEmits<{
  submit: [result?: FormSubmitResult]
}>()

// 由字段组件动态注册，支持条件渲染字段参与校验，用于自动 required 场景
// TODO: 后续可以考虑添加更多自动校验规则配置，如 min/max length、email 等，进一步简化使用
const fieldMetaMap = reactive<Record<string, FormFieldMeta>>({})
// 组件内部统一错误源，字段组件默认从这里读取首条错误。
const internalErrors = reactive<FormValidationErrors<FormValues>>({})

// 与校验器中的空值规则保持一致，确保自动 required 行为可预期。
const isEmptyValue = (value: unknown): boolean => {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

const setErrors = (errors: FormValidationErrors<FormValues>) => {
  // 先清空再覆盖，避免旧字段错误残留。
  for (const key of Object.keys(internalErrors)) {
    delete internalErrors[key]
  }
  for (const [field, fieldErrors] of Object.entries(errors)) {
    if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
      internalErrors[field] = [...fieldErrors]
    }
  }
}

const getFieldError = (field: string): string | undefined => {
  // 返回首条错误，避免字段组件需要处理数组逻辑
  return internalErrors[field]?.[0]
}

const clearErrors = () => {
  for (const key of Object.keys(internalErrors)) {
    delete internalErrors[key]
  }
}

const runAutoRequiredForField = (
  field: string,
  values: FormValues,
  currentErrors: string[]
): string[] => {
  // 从注册字段元信息中读取 required 声明，自动注入必填错误文案
  const meta = fieldMetaMap[field]
  if (!meta || !meta.required) return currentErrors
  // 用户显式配置 required 规则时，不再注入默认 required 文案。
  if (props.validator?.hasRuleType(field, 'required')) return currentErrors
  // 自动 required 规则：当字段声明 required 且值为空时，注入默认必填错误文案。
  if (isEmptyValue(values[field])) {
    const requiredMessage = `请输入${meta.name}信息`
    return [requiredMessage, ...currentErrors]
  }

  return currentErrors
}

const validateForm = async (): Promise<FormSubmitResult> => {
  // 未传入 values 时，Form 只作为布局容器使用，不参与校验。
  if (!props.values) {
    clearErrors()
    return {
      valid: true,
      errors: {},
    }
  }
  // 先执行外部 validator 校验
  if (props.validator) {
    // 组件内调用 validator.validate() 时，外部 validator 也会通过 subscribeValidation 触发校验事件，保持内部错误状态同步，无需重复 setErrors
    const res = await props.validator.validate(props.values)
    // 外部 validate 内部通过 runAutoRequiredForField 补齐了自动 required 规则
    return res
  }

  // 没有外部 validator 时，Form 内部根据字段元信息自动执行 required 校验，保证必填规则生效
  const baseResult = {
    valid: true,
    errors: {} as FormValidationErrors<FormValues>,
  }

  const mergedErrors: FormValidationErrors<FormValues> = {}
  for (const [field, errors] of Object.entries(baseResult.errors)) {
    if (Array.isArray(errors) && errors.length > 0) {
      mergedErrors[field] = [...errors]
    }
  }

  // 即使没有外部 validator，也要让字段组件声明的 required 生效。
  for (const field of Object.keys(fieldMetaMap)) {
    const currentErrors = mergedErrors[field] || []
    const nextErrors = runAutoRequiredForField(
      field,
      props.values,
      currentErrors
    )
    if (nextErrors.length > 0) {
      mergedErrors[field] = nextErrors
    }
  }

  const result: FormSubmitResult = {
    valid: Object.keys(mergedErrors).length === 0,
    errors: mergedErrors,
  }
  setErrors(result.errors)
  return result
}

const handleSubmit = async () => {
  // 保留手动模式：validateOnSubmit=false 时仅抛出 submit 事件
  // 当未传入 validator 时要退化到自动模式，避免 required 等自动规则失效导致
  if (!props.validateOnSubmit && props.validator) {
    emit('submit')
    return
  }
  // validateOnSubmit=true 时由 Form 内部完成校验，但不再向外暴露命令式方法。
  const result = await validateForm()
  // 无论校验结果如何都抛出 submit 事件，由业务方根据结果决定后续行为
  emit('submit', result)
}

const registerField = (meta: FormFieldMeta) => {
  // 同名字段后注册覆盖先注册，用于动态切换 label/required 状态。
  fieldMetaMap[meta.field] = meta
}

const unregisterField = (field: string) => {
  delete fieldMetaMap[field]
  delete internalErrors[field]
}

let unsubscribeValidation: (() => void) | undefined

// 监听 validator 的校验事件：
// 即使业务层只调用 validator.validate()，也能驱动 Form 内部错误展示。
const bindValidatorListener = () => {
  unsubscribeValidation?.()
  unsubscribeValidation = undefined

  if (!props.validator?.subscribeValidation) {
    return
  }

  unsubscribeValidation = props.validator.subscribeValidation((event) => {
    // 区分字段校验和整体验证事件，分别处理对应错误
    if (event.type === 'field') {
      const field = String(event.field)
      const values = (event.values || {}) as FormValues
      // 单字段校验时同样补齐自动 required 规则，保证表现一致。
      const nextErrors = runAutoRequiredForField(
        field,
        values,
        event.errors || []
      )
      // 字段校验时立即写回内部错误
      if (nextErrors.length > 0) {
        internalErrors[field] = [...nextErrors]
      } else {
        delete internalErrors[field]
      }
      return
    }

    if (event.type === 'form') {
      const values = (event.values || {}) as FormValues
      const mergedErrors: FormValidationErrors<FormValues> = {}

      for (const [field, fieldErrors] of Object.entries(event.errors || {})) {
        if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
          mergedErrors[field] = [...fieldErrors]
        }
      }

      // 外部 validate 的结果同样补齐自动 required 规则，保证表现一致。
      for (const field of Object.keys(fieldMetaMap)) {
        const currentErrors = mergedErrors[field] || []
        const nextErrors = runAutoRequiredForField(field, values, currentErrors)
        if (nextErrors.length > 0) {
          mergedErrors[field] = nextErrors
        }
      }
      // 整体验证时统一写回内部错误，避免重复触发字段组件更新
      setErrors(mergedErrors)
    }
    // 清空错误事件，重置内部错误状态，适用于外部手动调用 validator.clearErrors() 的场景
    if (event.type === 'clear') {
      clearErrors()
    }
  })
}

watch(
  // 监听 validator 变化，重新绑定事件订阅，确保 validateOnSubmit 场景切换时能正确响应校验结果
  () => props.validator,
  () => {
    bindValidatorListener()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  // 组件卸载时取消订阅
  unsubscribeValidation?.()
})

provide(formContextKey, {
  registerField,
  unregisterField,
  getFieldError,
})
</script>
