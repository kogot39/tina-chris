# Tina UI 表单组件使用说明

本文档说明 `tina-ui` 表单体系的推荐用法。表单组件遵循单向数据流：业务侧维护表单值，字段组件通过 `v-model` 抛出变更，校验器通过事件把错误同步给 `Form`，外部不再通过 `ref` 调用 `Form` 的内部方法。

## 组件清单

- `Form`：表单容器，提供字段注册、内部错误展示、自动 required 补充和可选提交校验。
- `FormItem`：统一标签、提示、错误文案和必填标记。
- `InputFieldItem`：文本、密码、数字等输入框。
- `TextareaFieldItem`：多行文本输入。
- `SelectFieldItem`：下拉选择。
- `SwitchFieldItem`：开关。
- `CheckboxFieldItem`：复选框。
- `UploadFieldItem`：文件上传。
- `DynamicForm`：按 schema 动态渲染设置表单，适合 provider 配置页等场景。

字段组件都需要传入 `name`。`name` 会用于表单值、校验规则和错误展示的字段映射。

## 基础表单

推荐由页面或业务组件持有表单数据，并显式调用 validator 完成保存前校验。`Form` 只负责收集字段元信息和展示错误。

```vue
<template>
  <FieldsetLayout
    save-text="保存设置"
    :saving="submitting"
    :disabled="submitting"
    @save="handleSubmit"
  >
    <Form :values="form" :validator="validator" legend="个人设置">
      <InputFieldItem
        v-model="form.name"
        name="name"
        label="昵称"
        placeholder="请输入昵称"
        required
      />

      <SelectFieldItem
        v-model="form.theme"
        name="theme"
        label="主题"
        :options="themeOptions"
        placeholder="请选择主题"
        required
      />

      <SwitchFieldItem
        v-model="form.enableVoice"
        name="enableVoice"
        label="语音回复"
        checked-text="开启"
        unchecked-text="关闭"
      />
    </Form>
  </FieldsetLayout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import {
  FieldsetLayout,
  Form,
  InputFieldItem,
  SelectFieldItem,
  SwitchFieldItem,
  createFormValidator,
  maxLength,
  minLength,
  pattern,
  required,
} from '@tina-chris/tina-ui'

type ProfileForm = {
  name: string
  email: string
  theme: string
  enableVoice: boolean
}

const submitting = ref(false)
const form = reactive<ProfileForm>({
  name: '',
  email: '',
  theme: '',
  enableVoice: true,
})

const themeOptions = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

const validator = createFormValidator<ProfileForm>({
  name: [required('请输入昵称'), minLength(2), maxLength(20)],
  email: [
    required('请输入邮箱'),
    pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确'),
  ],
  theme: [required('请选择主题')],
})

const handleSubmit = async () => {
  const result = await validator.validate(form)
  if (!result.valid) return

  submitting.value = true
  try {
    // TODO: 提交保存请求
  } finally {
    submitting.value = false
  }
}
</script>
```

## 校验工具

### 创建校验器

```ts
import {
  createFormValidator,
  customRule,
  maxLength,
  minLength,
  pattern,
  required,
} from '@tina-chris/tina-ui'

const validator = createFormValidator({
  name: [required('请输入名称'), minLength(2), maxLength(20)],
  endpoint: [pattern(/^https?:\/\//, '地址必须以 http:// 或 https:// 开头')],
  count: [
    customRule((value) => {
      return Number(value) > 0 ? null : '数量必须大于 0'
    }),
  ],
})
```

### 执行校验

```ts
const result = await validator.validate(form)

if (!result.valid) {
  console.log(result.errors)
}
```

调用 `validator.validate(values)` 或 `validator.validateField(field, values)` 后，`Form` 会通过订阅事件自动同步错误状态，字段组件会展示对应字段的第一条错误。

### 清空错误

```ts
validator.clearErrors()
```

`clearErrors()` 会通知当前订阅的 `Form` 清空内部错误状态。

## 自动 Required

- 字段组件设置 `required` 后，`Form` 会记录该字段的必填元信息。
- 如果 validator 中没有为该字段显式配置 `required(...)`，`Form` 会自动补充默认必填提示。
- 如果 validator 中已经配置了 `required(...)`，则使用自定义提示，避免重复错误。
- 字段错误由 `Form` 内部统一提供，业务侧不需要也不应该再给字段组件手动传 `error`。

## Form 提交模式

大多数页面建议使用外部保存按钮调用 `validator.validate(values)`。如果确实希望使用原生表单提交，也可以开启 `validateOnSubmit`：

```vue
<Form
  :values="form"
  :validator="validator"
  validate-on-submit
  @submit="handleFormSubmit"
>
  <InputFieldItem v-model="form.name" name="name" label="昵称" required />
  <button type="submit">保存</button>
</Form>
```

```ts
const handleFormSubmit = (result?: {
  valid: boolean
  errors: Record<string, string[]>
}) => {
  if (!result?.valid) return
  // TODO: 提交保存请求
}
```

`validateOnSubmit` 只是表单提交时的便捷模式，不会暴露命令式实例方法。

## DynamicForm

`DynamicForm` 用于按配置对象动态渲染表单，适合 LLM、STT、TTS、Tool provider 等配置页。父组件传入 `schema`、当前 `values` 和提交状态，组件会输出标准事件。

```vue
<template>
  <DynamicForm
    :schema="schema"
    :values="values"
    :submitting="submitting"
    @update:values="handleValuesChange"
    @submit="handleSubmit"
    @invalid="handleInvalid"
  />
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { DynamicForm } from '@tina-chris/tina-ui'

const submitting = ref(false)
const values = reactive<Record<string, unknown>>({})

const schema = {
  key: 'llm-config',
  legend: '大语言模型配置',
  saveText: '保存',
  showActions: true,
  fields: [
    {
      name: 'model',
      type: 'input',
      label: '模型名称',
      required: true,
      defaultValue: 'qwen-plus',
      componentProps: {
        placeholder: '请输入模型名称',
      },
    },
    {
      name: 'apiKey',
      type: 'input',
      label: 'API 密钥',
      required: true,
      componentProps: {
        type: 'password',
        prefix: 'Bearer',
      },
      rules: [{ type: 'required', message: '请输入 API 密钥' }],
    },
  ],
} as const

const handleValuesChange = (nextValues: Record<string, unknown>) => {
  Object.assign(values, nextValues)
}

const handleSubmit = async (payload: {
  schemaKey: string
  values: Record<string, unknown>
}) => {
  submitting.value = true
  try {
    console.log('submit payload', payload)
  } finally {
    submitting.value = false
  }
}

const handleInvalid = (errors: Record<string, string[]>) => {
  console.log('form invalid', errors)
}
</script>
```

### DynamicFormSchema

```ts
type DynamicFormSchema = {
  key: string
  legend?: string
  saveText?: string
  showActions?: boolean
  disabled?: boolean
  fields: DynamicFormFieldSchema[]
}
```

- `key`：当前表单唯一标识，`submit` 事件会回传该值。
- `legend`：表单标题。
- `saveText`：保存按钮文案，默认 `保存`。
- `showActions`：是否显示底部操作区，默认 `true`。
- `disabled`：是否禁用整表。
- `fields`：字段定义数组。

### DynamicFormFieldSchema

```ts
type DynamicFormFieldSchema = {
  name: string
  type: 'input' | 'textarea' | 'select' | 'switch' | 'checkbox' | 'upload'
  label?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  defaultValue?: unknown
  valueType?: 'string' | 'number' | 'boolean' | 'file'
  span?: 1 | 2
  visibleWhen?: DynamicFormFieldConditionGroup
  disabledWhen?: DynamicFormFieldConditionGroup
  rules?: DynamicFormFieldRuleDescriptor[]
  componentProps?: Record<string, unknown>
}
```

- `name`：字段键，必须唯一。
- `type`：渲染的字段组件类型。
- `label` / `hint`：标题与提示文案。
- `required`：必填标记；没有显式 required rule 时会生成默认必填规则。
- `disabled`：字段是否禁用。
- `defaultValue`：外部 `values` 未提供时使用。
- `valueType`：值归一化策略。
- `span`：布局占位，`1` 表示单列，`2` 表示跨两列。
- `visibleWhen`：显示条件。
- `disabledWhen`：禁用条件。
- `rules`：字段校验规则描述。
- `componentProps`：透传给对应字段组件。

### 条件表达式

```ts
type DynamicFormFieldCondition = {
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

type DynamicFormFieldConditionGroup = {
  logic?: 'and' | 'or'
  conditions: DynamicFormFieldCondition[]
}
```

```ts
{
  name: 'baseUrl',
  type: 'input',
  label: '接口地址',
  visibleWhen: {
    conditions: [{ field: 'provider', operator: 'eq', value: 'custom' }]
  }
}
```

`gt`、`gte`、`lt`、`lte` 会先将两侧转为数字，任一侧无法转换为有效数字时判定为不满足条件。

### 校验规则

```ts
type DynamicFormFieldRuleDescriptor =
  | { type: 'required'; message?: string }
  | { type: 'minLength'; value: number; message?: string }
  | { type: 'maxLength'; value: number; message?: string }
  | { type: 'pattern'; value: string; flags?: string; message?: string }
  | { type: 'file'; maxSize?: number; mimeTypes?: string[]; message?: string }
```

```ts
{
  name: 'apiKey',
  type: 'input',
  label: 'API 密钥',
  required: true,
  rules: [{ type: 'required', message: '请输入 API 密钥' }]
}
```

当 `required: true` 和 `rules` 中的 `required` 同时存在时，`rules` 中的提示优先，不会产生重复必填错误。这样可以用 `required` 控制 UI 星标，用 `rules` 控制错误文案。

文件校验示例：

```ts
{
  name: 'audioData',
  type: 'upload',
  label: '音频文件',
  valueType: 'file',
  componentProps: {
    accept: 'audio/wav,audio/mpeg,audio/mp4',
    placeholder: '请选择音频文件'
  },
  rules: [
    {
      type: 'file',
      maxSize: 10 * 1024 * 1024,
      mimeTypes: ['audio/wav', 'audio/mpeg', 'audio/mp4'],
      message: '请上传 10MB 以内的 wav/mp3/mp4 文件'
    }
  ]
}
```

### componentProps

- `input`：`placeholder`、`type`、`prefix`、`min`、`max`、`step`、`maxlength`、`minlength`、`autocomplete`。
- `textarea`：`placeholder`、`rows`、`maxlength`、`resize`。
- `select`：`options`、`placeholder`。
- `switch`：`checkedText`、`uncheckedText`。
- `checkbox`：`text`。
- `upload`：`accept`、`placeholder`。

### 事件协议

- `update:values`：内部表单值变化时触发，参数是最新值的浅拷贝。
- `submit`：点击保存且校验通过时触发，参数为 `{ schemaKey, values }`。
- `invalid`：点击保存但校验失败时触发，参数为字段错误对象。

### 自定义底部操作区

```vue
<DynamicForm :schema="schema" :values="values" @submit="handleSubmit">
  <template #actions="{ saving, disabled, submit }">
    <button type="button" class="btn" :disabled="disabled" @click="openList">
      查看列表
    </button>
    <button
      type="button"
      class="btn btn-primary"
      :disabled="disabled || saving"
      @click="submit"
    >
      保存
    </button>
  </template>
</DynamicForm>
```

自定义按钮建议显式设置 `type="button"`，避免放入其他表单结构时触发非预期提交。

## 常见问题

### 字段可以脱离 Form 使用吗？

可以用于纯展示或简单输入，但不会自动展示校验错误。需要错误展示时，请把字段放在同一个 `Form` 内，并传入对应 `values` 与 `validator`。

### DynamicForm 会提交隐藏字段吗？

会。隐藏字段不会参与校验，但仍保留在内部 `formData` 中并随 `submit` 事件返回。如果保存前需要剔除隐藏字段，请在父组件的 `submit` 处理中自行过滤。

### DynamicForm 为什么只校验可见字段？

动态表单常用于 provider 配置，不同 provider 或开关条件下会隐藏部分字段。隐藏字段不应阻塞当前可见配置的保存，因此校验器只根据当前可见字段构建。

### 什么时候使用固定 Form，什么时候使用 DynamicForm？

固定业务页面使用 `Form + 字段组件`，因为字段结构稳定、业务逻辑清晰。provider 配置、工具配置这类由服务端返回 schema 的页面使用 `DynamicForm`，新增 provider 时通常只需要新增配置对象。
