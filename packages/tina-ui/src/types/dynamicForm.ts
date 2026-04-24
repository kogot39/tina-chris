export type DynamicFormValues = Record<string, unknown>

export type DynamicFormFieldCondition = {
  field: string
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'notIn'
    | 'truthy'
    | 'falsy'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
  value?: unknown
}

export type DynamicFormFieldConditionGroup = {
  logic?: 'and' | 'or'
  conditions: DynamicFormFieldCondition[]
}

export type DynamicFormFieldRuleDescriptor =
  | {
      type: 'required'
      message?: string
    }
  | {
      type: 'minLength'
      value: number
      message?: string
    }
  | {
      type: 'maxLength'
      value: number
      message?: string
    }
  | {
      type: 'pattern'
      value: string
      flags?: string
      message?: string
    }
  | {
      type: 'file'
      maxSize?: number
      mimeTypes?: string[]
      message?: string
    }

export type DynamicFormFieldType =
  | 'input'
  | 'textarea'
  | 'select'
  | 'switch'
  | 'checkbox'
  | 'upload'

export type DynamicFormFieldValueType = 'string' | 'number' | 'boolean' | 'file'

export type DynamicFormFieldSchema = {
  name: string
  type: DynamicFormFieldType
  label?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  defaultValue?: unknown
  valueType?: DynamicFormFieldValueType
  span?: 1 | 2
  visibleWhen?: DynamicFormFieldConditionGroup
  disabledWhen?: DynamicFormFieldConditionGroup
  rules?: DynamicFormFieldRuleDescriptor[]
  componentProps?: Record<string, unknown>
}

export type DynamicFormSchema = {
  key: string
  legend?: string
  saveText?: string
  showActions?: boolean
  disabled?: boolean
  fields: DynamicFormFieldSchema[]
}

export type DynamicFormSubmitPayload = {
  schemaKey: string
  values: DynamicFormValues
}
