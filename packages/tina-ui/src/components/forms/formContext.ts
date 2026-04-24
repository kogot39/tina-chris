import type { InjectionKey } from 'vue'

/**
 * 字段元信息由字段组件在挂载时注册。
 * field: 与 values/validator 中的字段 key 对齐。
 * name: 用于默认必填提示文案。
 */
export type FormFieldMeta = {
  field: string
  name: string
  required: boolean
}

/**
 * Form 对字段组件暴露的最小能力集合。
 */
export type FormContextValue = {
  registerField: (meta: FormFieldMeta) => void
  unregisterField: (field: string) => void
  getFieldError: (field: string) => string | undefined
}

/**
 * 通过 Symbol 避免多表单或多库场景下注入 key 冲突。
 */
export const formContextKey: InjectionKey<FormContextValue> =
  Symbol('tina-form-context')
