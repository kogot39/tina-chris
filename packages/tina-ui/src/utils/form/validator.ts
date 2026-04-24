export type ValidationResult = string | null | undefined

export type MaybePromise<T> = T | Promise<T>

export type ValidationRule<TValues, TField extends keyof TValues> = (
  value: TValues[TField],
  context: {
    field: TField
    values: TValues
  }
) => MaybePromise<ValidationResult>

export type ValidationRuleType = 'required'

// 规则函数挂载轻量元信息，供组件层识别规则类型。
// 不影响规则函数本身的调用签名。
type RuleWithMeta<TValues, TField extends keyof TValues> = ValidationRule<
  TValues,
  TField
> & {
  __tinaRuleType?: ValidationRuleType
}

export type FormRules<TValues extends Record<string, unknown>> = {
  [K in keyof TValues]?: ValidationRule<TValues, K>[]
}

export type FormValidationErrors<TValues extends Record<string, unknown>> = {
  [K in keyof TValues]?: string[]
}

export type FormValidationEvent<TValues extends Record<string, unknown>> =
  | {
      type: 'form'
      values: TValues
      valid: boolean
      errors: FormValidationErrors<TValues>
    }
  | {
      type: 'field'
      values: TValues
      field: keyof TValues
      errors: string[]
    }
  | {
      type: 'clear'
    }

export type FormValidationListener<TValues extends Record<string, unknown>> = (
  event: FormValidationEvent<TValues>
) => void

export type FormValidator<TValues extends Record<string, unknown>> = {
  validate: (values: TValues) => Promise<{
    valid: boolean
    errors: FormValidationErrors<TValues>
  }>
  validateField: <TField extends keyof TValues>(
    field: TField,
    values: TValues
  ) => Promise<string[]>
  hasRuleType: <TField extends keyof TValues>(
    field: TField,
    type: ValidationRuleType
  ) => boolean
  clearErrors: () => void
  subscribeValidation: (listener: FormValidationListener<TValues>) => () => void
}

// 统一空值判定：null/undefined、空白字符串、空数组都视为空。
const isEmptyValue = (value: unknown): boolean => {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

// 必填校验规则工厂
export const required = <
  TValues extends Record<string, unknown>,
  TField extends keyof TValues,
>(
  message = '该字段为必填项'
): ValidationRule<TValues, TField> => {
  // 用闭包保存 message，避免运行时拼接默认文案开销。
  const rule: RuleWithMeta<TValues, TField> = (value) => {
    return isEmptyValue(value) ? message : null
  }
  // 约定元信息字段，供 Form 自动 required 判断是否需要补充默认规则。
  rule.__tinaRuleType = 'required'
  return rule
}

// 最小长度校验规则工厂（仅对字符串生效）
export const minLength =
  <TValues extends Record<string, unknown>, TField extends keyof TValues>(
    min: number,
    message?: string
  ): ValidationRule<TValues, TField> =>
  (value) => {
    if (isEmptyValue(value)) return null
    if (typeof value !== 'string') return '字段类型错误'
    return value.length < min ? message || `长度不能少于 ${min} 个字符` : null
  }

// 最大长度校验规则工厂（仅对字符串生效）
export const maxLength =
  <TValues extends Record<string, unknown>, TField extends keyof TValues>(
    max: number,
    message?: string
  ): ValidationRule<TValues, TField> =>
  (value) => {
    if (isEmptyValue(value)) return null
    if (typeof value !== 'string') return '字段类型错误'
    return value.length > max ? message || `长度不能超过 ${max} 个字符` : null
  }

// TODO: 后续添加对数字、数组等类型的 min/max 规则工厂

// 正则格式校验规则工厂（仅对字符串生效）。
export const pattern =
  <TValues extends Record<string, unknown>, TField extends keyof TValues>(
    regex: RegExp,
    message = '格式不正确'
  ): ValidationRule<TValues, TField> =>
  (value) => {
    if (isEmptyValue(value)) return null
    if (typeof value !== 'string') return '字段类型错误'
    return regex.test(value) ? null : message
  }

// 透传自定义规则，便于保持规则类型推导一致。
export const customRule =
  <TValues extends Record<string, unknown>, TField extends keyof TValues>(
    validator: ValidationRule<TValues, TField>
  ): ValidationRule<TValues, TField> =>
  (value, context) => {
    return validator(value, context)
  }

// 创建表单校验器，返回字段校验与整体验证能力。
export function createFormValidator<TValues extends Record<string, unknown>>(
  rules: FormRules<TValues>
): FormValidator<TValues> {
  const listeners = new Set<FormValidationListener<TValues>>()

  const notifyValidation = (event: FormValidationEvent<TValues>) => {
    for (const listener of listeners) {
      listener(event)
    }
  }

  // 执行单个字段的全部规则，收集所有错误信息。
  const runFieldRules = async <TField extends keyof TValues>(
    field: TField,
    values: TValues
  ): Promise<string[]> => {
    // 某字段未配置规则时返回空错误数组，保持调用端语义稳定。
    const fieldRules = rules[field] || []
    const errors: string[] = []

    for (const rule of fieldRules) {
      const result = await rule(values[field], { field, values })
      if (typeof result === 'string' && result.length > 0) {
        errors.push(result)
      }
    }

    return errors
  }

  // 对外暴露：校验单个字段。
  const validateField = async <TField extends keyof TValues>(
    field: TField,
    values: TValues
  ): Promise<string[]> => {
    const errors = await runFieldRules(field, values)
    notifyValidation({
      type: 'field',
      values,
      field,
      errors,
    })
    return errors
  }

  // 判断字段是否包含指定类型规则
  // 用于检查是否有手动配置的 required 规则，决定是否补充默认必填规则
  const hasRuleType = <TField extends keyof TValues>(
    field: TField,
    type: ValidationRuleType
  ): boolean => {
    const fieldRules = rules[field] || []
    // 仅做静态声明检查，不执行规则函数。
    return fieldRules.some((rule) => {
      return (rule as RuleWithMeta<TValues, TField>).__tinaRuleType === type
    })
  }

  // 对外暴露：校验所有配置字段，并返回统一结构。
  const validate = async (
    values: TValues
  ): Promise<{
    valid: boolean
    errors: FormValidationErrors<TValues>
  }> => {
    const errors: FormValidationErrors<TValues> = {}

    // 仅遍历已配置规则的字段，避免无规则字段参与校验。
    const fields = Object.keys(rules) as (keyof TValues)[]
    for (const field of fields) {
      const fieldErrors = await runFieldRules(field, values)
      if (fieldErrors.length > 0) {
        errors[field] = fieldErrors
      }
    }

    const result = {
      valid: Object.keys(errors).length === 0,
      errors,
    }
    // 整体验证结果通过事件通知外部
    // 顺便配合组件内的自动 required 场景
    notifyValidation({
      type: 'form',
      values,
      valid: result.valid,
      errors: result.errors,
    })

    return result
  }

  // Form 通过订阅该事件，在外部手动调用 validate 时也能同步展示错误
  const subscribeValidation = (listener: FormValidationListener<TValues>) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    validate,
    validateField,
    hasRuleType,
    subscribeValidation,
    clearErrors: () => {
      notifyValidation({
        type: 'clear',
      })
    },
  }
}

// 获取字段第一条错误信息，便于表单项直接展示。
export const firstError = <TValues extends Record<string, unknown>>(
  errors: FormValidationErrors<TValues>,
  field: keyof TValues
): string | undefined => {
  return errors[field]?.[0]
}
