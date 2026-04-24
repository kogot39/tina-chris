<template>
  <FieldsetLayout
    :saving="submitting"
    :disabled="submitting || schema.disabled"
    :save-text="schema.saveText || '保存'"
    :show-actions="schema.showActions !== false"
    @save="handleSubmit"
  >
    <Form
      :values="formData"
      :validator="activeValidator"
      :legend="schema.legend"
    >
      <component
        :is="resolveFieldComponent(field.type)"
        v-for="field in visibleFields"
        :key="field.name"
        :name="field.name"
        :label="field.label || field.name"
        :hint="field.hint"
        :required="field.required"
        :disabled="isFieldDisabled(field)"
        :model-value="formData[field.name]"
        :class="field.span === 2 ? 'col-span-2' : undefined"
        v-bind="field.componentProps"
        @update:model-value="(value: unknown) => updateFieldValue(field, value)"
      />
    </Form>
    <template #actions="{ saving, disabled }">
      <slot
        name="actions"
        :saving="saving"
        :disabled="disabled"
        :submit="handleSubmit"
      >
        <button
          class="btn btn-primary btn-soft min-w-24"
          :disabled="disabled || saving"
          @click="handleSubmit"
        >
          <span v-if="saving" class="loading loading-spinner" />
          {{ schema.saveText || '保存' }}
        </button>
      </slot>
    </template>
  </FieldsetLayout>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  CheckboxFieldItem,
  InputFieldItem,
  SelectFieldItem,
  SwitchFieldItem,
  TextareaFieldItem,
  UploadFieldItem,
} from './index'
import { FieldsetLayout } from '../layouts'
import Form from './Form.vue'
import {
  type FormValidationErrors,
  type ValidationRule,
  createFormValidator,
  customRule,
  maxLength,
  minLength,
  pattern,
  required,
} from '../../utils/form'

import type {
  DynamicFormFieldCondition,
  DynamicFormFieldConditionGroup,
  DynamicFormFieldRuleDescriptor,
  DynamicFormFieldSchema,
  DynamicFormFieldType,
  DynamicFormSchema,
  DynamicFormSubmitPayload,
  DynamicFormValues,
} from '../../types'

const props = withDefaults(
  defineProps<{
    schema: DynamicFormSchema
    values?: DynamicFormValues
    submitting?: boolean
  }>(),
  {
    values: () => ({}),
    submitting: false,
  }
)

const emit = defineEmits<{
  'update:values': [values: DynamicFormValues]
  submit: [payload: DynamicFormSubmitPayload]
  invalid: [errors: FormValidationErrors<DynamicFormValues>]
}>()

const formData = reactive<DynamicFormValues>({})

const fieldComponentMap: Record<DynamicFormFieldType, unknown> = {
  input: InputFieldItem,
  textarea: TextareaFieldItem,
  select: SelectFieldItem,
  switch: SwitchFieldItem,
  checkbox: CheckboxFieldItem,
  upload: UploadFieldItem,
} as const

const resolveFieldComponent = (type: DynamicFormFieldType) => {
  return fieldComponentMap[type] || InputFieldItem
}

const cloneValues = (values: DynamicFormValues): DynamicFormValues => {
  return Object.fromEntries(Object.entries(values))
}

const parseNumberValue = (value: unknown): number | '' => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return ''

  const normalized = value.trim()
  if (!normalized) return ''

  const next = Number(normalized)
  return Number.isFinite(next) ? next : ''
}

const normalizeFieldValue = (
  field: DynamicFormFieldSchema,
  value: unknown
): unknown => {
  const valueType = field.valueType
  if (valueType === 'number') {
    return parseNumberValue(value)
  }

  if (valueType === 'boolean') {
    return Boolean(value)
  }

  if (valueType === 'file') {
    return value instanceof File || value === null ? value : null
  }

  if (valueType === 'string' && value != null) {
    return String(value)
  }

  return value
}

const getDefaultValue = (field: DynamicFormFieldSchema): unknown => {
  if (field.defaultValue !== undefined) {
    return normalizeFieldValue(field, field.defaultValue)
  }

  if (field.valueType === 'boolean') {
    return false
  }
  if (field.valueType === 'number') {
    return ''
  }
  if (field.valueType === 'file' || field.type === 'upload') {
    return null
  }
  if (field.type === 'switch' || field.type === 'checkbox') {
    return false
  }
  return ''
}

const evaluateCondition = (
  condition: DynamicFormFieldCondition,
  values: DynamicFormValues
): boolean => {
  const current = values[condition.field]
  const operator = condition.operator

  if (operator === 'truthy') return Boolean(current)
  if (operator === 'falsy') return !current
  if (operator === 'eq') return current === condition.value
  if (operator === 'neq') return current !== condition.value

  if (operator === 'in') {
    if (!Array.isArray(condition.value)) return false
    return condition.value.includes(current)
  }

  if (operator === 'notIn') {
    if (!Array.isArray(condition.value)) return true
    return !condition.value.includes(current)
  }

  const left = Number(current)
  const right = Number(condition.value)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false

  if (operator === 'gt') return left > right
  if (operator === 'gte') return left >= right
  if (operator === 'lt') return left < right
  if (operator === 'lte') return left <= right

  return true
}

const matchConditionGroup = (
  conditionGroup: DynamicFormFieldConditionGroup | undefined,
  values: DynamicFormValues
): boolean => {
  if (!conditionGroup || conditionGroup.conditions.length === 0) return true

  const logic = conditionGroup.logic || 'and'
  if (logic === 'or') {
    return conditionGroup.conditions.some(
      (condition: DynamicFormFieldCondition) => {
        return evaluateCondition(condition, values)
      }
    )
  }

  return conditionGroup.conditions.every(
    (condition: DynamicFormFieldCondition) => {
      return evaluateCondition(condition, values)
    }
  )
}

const isFieldVisible = (field: DynamicFormFieldSchema): boolean => {
  return matchConditionGroup(field.visibleWhen, formData)
}

const visibleFields = computed(() => {
  return props.schema.fields.filter((field: DynamicFormFieldSchema) => {
    return isFieldVisible(field)
  })
})

const isFieldDisabled = (field: DynamicFormFieldSchema): boolean => {
  if (props.submitting || props.schema.disabled || field.disabled) {
    return true
  }
  if (!field.disabledWhen) {
    return false
  }
  return matchConditionGroup(field.disabledWhen, formData)
}

const toValidationRule = (
  rule: DynamicFormFieldRuleDescriptor,
  fieldLabel: string
): ValidationRule<DynamicFormValues, string> => {
  if (rule.type === 'required') {
    return required(rule.message || `请输入${fieldLabel}`)
  }

  if (rule.type === 'minLength') {
    return minLength(rule.value, rule.message)
  }

  if (rule.type === 'maxLength') {
    return maxLength(rule.value, rule.message)
  }

  if (rule.type === 'pattern') {
    try {
      return pattern(
        new RegExp(rule.value, rule.flags),
        rule.message || '格式不正确'
      )
    } catch {
      return customRule(() => {
        return '正则配置无效'
      })
    }
  }

  return customRule((value: unknown) => {
    if (!(value instanceof File)) {
      return null
    }

    if (rule.maxSize && value.size > rule.maxSize) {
      return (
        rule.message ||
        `文件大小不能超过 ${Math.floor(rule.maxSize / 1024 / 1024)}MB`
      )
    }

    if (
      rule.mimeTypes &&
      rule.mimeTypes.length > 0 &&
      !rule.mimeTypes.includes(value.type)
    ) {
      return rule.message || '文件类型不受支持'
    }

    return null
  })
}

const activeValidator = computed(() => {
  const rules: Record<string, ValidationRule<DynamicFormValues, string>[]> = {}
  const visibleNames = new Set(
    visibleFields.value.map((field: DynamicFormFieldSchema) => {
      return field.name
    })
  )

  for (const field of props.schema.fields) {
    if (!visibleNames.has(field.name)) continue

    const fieldRules: ValidationRule<DynamicFormValues, string>[] = []
    const ruleDescriptors = field.rules || []
    const hasExplicitRequiredRule = ruleDescriptors.some((descriptor) => {
      return descriptor.type === 'required'
    })

    if (field.required && !hasExplicitRequiredRule) {
      fieldRules.push(required(`请输入${field.label || field.name}`))
    }

    for (const descriptor of ruleDescriptors) {
      fieldRules.push(toValidationRule(descriptor, field.label || field.name))
    }

    if (fieldRules.length > 0) {
      rules[field.name] = fieldRules
    }
  }

  return createFormValidator<DynamicFormValues>(rules)
})

const syncFormData = () => {
  const fieldNames = new Set(
    props.schema.fields.map((field: DynamicFormFieldSchema) => {
      return field.name
    })
  )

  for (const existingField of Object.keys(formData)) {
    if (!fieldNames.has(existingField)) {
      delete formData[existingField]
    }
  }

  for (const field of props.schema.fields) {
    if (Object.prototype.hasOwnProperty.call(props.values, field.name)) {
      formData[field.name] = normalizeFieldValue(
        field,
        props.values[field.name]
      )
      continue
    }

    if (!Object.prototype.hasOwnProperty.call(formData, field.name)) {
      formData[field.name] = getDefaultValue(field)
    }
  }
}

const updateFieldValue = (field: DynamicFormFieldSchema, value: unknown) => {
  formData[field.name] = normalizeFieldValue(field, value)
}

const handleSubmit = async () => {
  const result = await activeValidator.value.validate(formData)
  if (!result || !result.valid) {
    emit('invalid', result?.errors || {})
    return
  }

  emit('submit', {
    schemaKey: props.schema.key,
    values: cloneValues(formData),
  })
}

watch(
  () => props.schema,
  () => {
    syncFormData()
  },
  { immediate: true, deep: true }
)

watch(
  () => props.values,
  (nextValues) => {
    for (const field of props.schema.fields) {
      if (Object.prototype.hasOwnProperty.call(nextValues, field.name)) {
        formData[field.name] = normalizeFieldValue(
          field,
          nextValues[field.name]
        )
      }
    }
  },
  { deep: true }
)

watch(
  formData,
  () => {
    emit('update:values', cloneValues(formData))
  },
  { deep: true }
)
</script>
