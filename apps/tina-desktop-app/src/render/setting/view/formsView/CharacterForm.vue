<template>
  <FieldsetLayout
    :saving="submitting"
    :disabled="submitting || modelPending || loading"
    save-text="保存 Agent 配置"
    @save="handleSubmit"
  >
    <Form legend="Live2D 模型配置">
      <div class="flex gap-2 w-full items-end col-span-2">
        <SelectFieldItem
          :value="activeModelId"
          name="live2dModel"
          label="Live2D 模型"
          :disabled="submitting || modelPending || loading"
          :options="models"
          class="flex-1"
          @change="handleModelSwitch"
        />
        <BaseButton
          shape="square"
          :disabled="
            submitting || modelPending || loading || !canDeleteActiveModel
          "
          @click="handleDeleteActiveModel"
        >
          <iconpark-icon name="minus" />
        </BaseButton>
        <BaseButton
          shape="square"
          :disabled="submitting || modelPending || loading"
          @click="handleImportModel"
        >
          <iconpark-icon name="plus" />
        </BaseButton>
      </div>
    </Form>

    <Form
      :values="agentForm"
      :validator="agentRuntimeValidator"
      legend="Agent 运行配置"
    >
      <InputFieldItem
        v-model="agentForm.workspace"
        name="workspace"
        label="工作目录"
        hint="保存记忆、skills、提示词等数据目录"
        placeholder="~/my-agent-workspace"
        required
      />
      <InputFieldItem
        v-model="agentForm.model"
        name="model"
        label="模型名称"
        hint="若当前 LLM 为 custom，请填写模型名称"
        placeholder="gpt-4.1 / qwen-plus / claude-sonnet..."
      />
      <InputFieldItem
        v-model="agentForm.maxTokens"
        name="maxTokens"
        label="最大 Token 数"
        hint="默认值 8192"
        type="number"
        min="1"
        step="1"
      />
      <InputFieldItem
        v-model="agentForm.temperature"
        name="temperature"
        label="温度"
        hint="默认值 0.7"
        type="number"
        min="0"
        max="1"
        step="0.1"
      />
      <InputFieldItem
        v-model="agentForm.maxToolInteractions"
        name="maxToolInteractions"
        label="最大工具调用次数"
        hint="默认值 20"
        type="number"
        min="1"
        step="1"
      />
    </Form>
    <Form legend="用户信息配置">
      <InputFieldItem
        v-model="agentForm.userProfile.name"
        name="userName"
        label="你的名字"
      />
      <InputFieldItem
        v-model="agentForm.userProfile.timezone"
        name="userTimezone"
        label="时区"
        placeholder="Asia/Shanghai"
      />
      <InputFieldItem
        v-model="agentForm.userProfile.language"
        name="userLanguage"
        label="语言偏好"
        placeholder="中文 / English"
      />
      <SelectFieldItem
        v-model="agentForm.userProfile.communicationStyle"
        name="communicationStyle"
        label="沟通风格"
        :options="communicationStyleOptions"
      />
      <SelectFieldItem
        v-model="agentForm.userProfile.responseLength"
        name="responseLength"
        label="回复长度"
        :options="responseLengthOptions"
      />
      <SelectFieldItem
        v-model="agentForm.userProfile.technicalLevel"
        name="technicalLevel"
        label="技术水平"
        :options="technicalLevelOptions"
      />
      <InputFieldItem
        v-model="agentForm.userProfile.primaryRole"
        name="primaryRole"
        label="主要角色"
        placeholder="开发者 / 研究者 / 产品经理"
      />
      <TextareaFieldItem
        v-model="agentForm.userProfile.interestsAndHobbies"
        name="interestsAndHobbies"
        label="兴趣爱好"
        hint="每行一条兴趣爱好，保存时会转换为列表"
        :rows="4"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.userProfile.personalHabits"
        name="personalHabits"
        label="个人习惯"
        hint="每行一条个人习惯，保存时会转换为列表"
        :rows="4"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.userProfile.specialInstructions"
        name="specialInstructions"
        label="额外说明"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
    </Form>

    <Form legend="智能体行为配置">
      <TextareaFieldItem
        v-model="agentForm.agentPrompt.identity"
        name="agentIdentity"
        label="行为总体指导"
        :rows="4"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.agentPrompt.guidelines"
        name="agentGuidelines"
        label="行为准则"
        hint="每行一条准则，保存时会转换为列表"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.agentPrompt.additionalInstructions"
        name="agentAdditionalInstructions"
        label="补充约束"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
    </Form>

    <Form legend="内在自我认识">
      <TextareaFieldItem
        v-model="agentForm.soulPrompt.identity"
        name="soulIdentity"
        label="灵魂设定"
        hint="第一人称描述 agent 身份信息"
        :rows="4"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.soulPrompt.personalityTraits"
        name="soulPersonalityTraits"
        label="性格特征"
        hint="每行一条特征，保存时会转换为列表"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.soulPrompt.coreValues"
        name="soulCoreValues"
        label="核心价值观"
        hint="每行一条价值观，保存时会转换为列表"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.soulPrompt.communicationStyle"
        name="soulCommunicationStyle"
        label="表达风格"
        hint="每行一条表达风格，保存时会转换为列表"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
      <TextareaFieldItem
        v-model="agentForm.soulPrompt.additionalNotes"
        name="soulAdditionalNotes"
        label="补充说明"
        :rows="5"
        class="col-span-2"
        resize="none"
      />
    </Form>
  </FieldsetLayout>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue'
import {
  BaseButton,
  FieldsetLayout,
  Form,
  InputFieldItem,
  SelectFieldItem,
  TextareaFieldItem,
  createFormValidator,
  customRule,
  required,
} from '@tina-chris/tina-ui'
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_INTERACTIONS,
  DEFAULT_TEMPERATURE,
  createEmptyAgentPrompt,
  createEmptyAgentUserProfile,
  createEmptySoulPrompt,
} from '../../../../shared/agentConfig'
import {
  getAgentConfig,
  saveAgentConfig,
} from '../../services/agentConfigService'

import type {
  AgentConfigData,
  AgentPromptData,
  AgentUserProfileData,
  SoulPromptData,
  StoredModelSource,
} from '../../../../shared'

const toast = inject<any>('toast')
const modal = inject<any>('modal')

type StoredModelItem = {
  value: string
  label: string
  source: StoredModelSource
}

// 在编辑过程中，数字字段保持为字符串，因为用户界面输入的是文本
// 仅当用户保存时，才会对这些内容进行解析和验证
type AgentFormState = {
  workspace: string
  model: string
  maxTokens: string
  temperature: string
  maxToolInteractions: string
  userProfile: AgentUserProfileData
  agentPrompt: AgentPromptData
  soulPrompt: SoulPromptData
}

// 交流风格、回复长度和技术水平的选项列表，供用户配置使用
const communicationStyleOptions = [
  { label: '轻松', value: 'Casual' },
  { label: '专业', value: 'Professional' },
  { label: '技术导向', value: 'Technical' },
]

const responseLengthOptions = [
  { label: '简洁', value: 'Brief and concise' },
  { label: '详细说明', value: 'Detailed explanations' },
  { label: '按问题自适应', value: 'Adaptive based on question' },
]

const technicalLevelOptions = [
  { label: '初学者', value: 'Beginner' },
  { label: '中级', value: 'Intermediate' },
  { label: '专家', value: 'Expert' },
]

// 创建一个函数来生成默认的 AgentFormState 对象，这样在需要重置表单时可以调用它，保持响应式对象的稳定性
const createDefaultAgentForm = (): AgentFormState => ({
  workspace: '',
  model: '',
  maxTokens: String(DEFAULT_MAX_TOKENS),
  temperature: String(DEFAULT_TEMPERATURE),
  maxToolInteractions: String(DEFAULT_MAX_TOOL_INTERACTIONS),
  userProfile: createEmptyAgentUserProfile(),
  agentPrompt: createEmptyAgentPrompt(),
  soulPrompt: createEmptySoulPrompt(),
})

const agentForm = reactive<AgentFormState>(createDefaultAgentForm())

const parsedNumber = (value: string): number | null => {
  const normalized = value.trim()
  return normalized ? Number(normalized) : null
}

// Agent 运行配置只包含少量固定规则，直接复用 UI 库的表单校验能力。
// 这样错误状态完全由 Form 内部维护，页面无需再手写 error state。
const agentRuntimeValidator = createFormValidator<AgentFormState>({
  workspace: [required('请输入工作目录')],
  // TODO: 应该单独做一个数字输入组件，内置数值校验规则。现在先在这里做字符串形式的数字校验。
  maxTokens: [
    customRule((value) => {
      const parsed = parsedNumber(value)
      if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
        return '最大 Token 数必须是大于 0 的整数'
      }
      return null
    }),
  ],
  temperature: [
    customRule((value) => {
      const parsed = parsedNumber(value)
      if (
        parsed === null ||
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        parsed > 1
      ) {
        return '温度必须是 0 到 1 之间的数字'
      }
      return null
    }),
  ],
  maxToolInteractions: [
    customRule((value) => {
      const parsed = parsedNumber(value)
      if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
        return '最大工具调用次数必须是大于 0 的整数'
      }
      return null
    }),
  ],
})

const submitting = ref(false)
const loading = ref(false)
const modelPending = ref(false)
const models = ref<StoredModelItem[]>([])
const activeModelId = ref('')

const activeModel = computed(() => {
  return models.value.find((item) => item.value === activeModelId.value)
})

// 默认自带模型不可删除，只有用户导入的模型才允许删除
const canDeleteActiveModel = computed(() => {
  return activeModel.value?.source === 'custom'
})

// 更新配置
const assignAgentForm = (next: AgentFormState) => {
  agentForm.workspace = next.workspace
  agentForm.model = next.model
  agentForm.maxTokens = next.maxTokens
  agentForm.temperature = next.temperature
  agentForm.maxToolInteractions = next.maxToolInteractions
  agentForm.userProfile = { ...next.userProfile }
  agentForm.agentPrompt = { ...next.agentPrompt }
  agentForm.soulPrompt = { ...next.soulPrompt }
}

// 将存储的配置转换表单内容形式
const toAgentForm = (config: AgentConfigData): AgentFormState => ({
  workspace: config.workspace || '',
  model: config.model || '',
  maxTokens: String(config.maxTokens ?? DEFAULT_MAX_TOKENS),
  temperature: String(config.temperature ?? DEFAULT_TEMPERATURE),
  maxToolInteractions: String(
    config.maxToolInteractions ?? DEFAULT_MAX_TOOL_INTERACTIONS
  ),
  userProfile: {
    ...createEmptyAgentUserProfile(),
    ...config.userProfile,
  },
  agentPrompt: {
    ...createEmptyAgentPrompt(),
    ...config.agentPrompt,
  },
  soulPrompt: {
    ...createEmptySoulPrompt(),
    ...config.soulPrompt,
  },
})

// 这里转换是因为表单中用户输入的是字符串形式的数字，对应组件没有自动去做转换
// TODO: 后续可以考虑在 InputFieldItem 组件内部做类型转换或是单独做数字输入组件，这样表单层就不需要关心数字输入的特殊处理了
const normalizePositiveInteger = (value: string, fallback: number) => {
  const normalized = value.trim()
  return normalized ? Number(normalized) : fallback
}

const buildAgentSavePayload = async (): Promise<AgentConfigData | null> => {
  // 表单校验，确保输入合法后再进行数据转换和保存
  const validationResult = await agentRuntimeValidator.validate(agentForm)
  if (!validationResult.valid) {
    toast.warning?.('表单校验未通过，请检查输入')
    return null
  }

  return {
    workspace: agentForm.workspace.trim(),
    model: agentForm.model.trim(),
    maxTokens: normalizePositiveInteger(
      agentForm.maxTokens,
      DEFAULT_MAX_TOKENS
    ),
    temperature: normalizePositiveInteger(
      agentForm.temperature,
      DEFAULT_TEMPERATURE
    ),
    maxToolInteractions: normalizePositiveInteger(
      agentForm.maxToolInteractions,
      DEFAULT_MAX_TOOL_INTERACTIONS
    ),
    userProfile: {
      ...agentForm.userProfile,
    },
    agentPrompt: {
      ...agentForm.agentPrompt,
    },
    soulPrompt: {
      ...agentForm.soulPrompt,
    },
  }
}
// 加载现有的配置数据并填充表单
const loadAgentSettings = async () => {
  loading.value = true
  try {
    const config = await getAgentConfig()
    // 转换成表单内容形式并更新表单状态
    assignAgentForm(toAgentForm(config))
  } finally {
    loading.value = false
  }
}

// 加载 live2d 模型列表和当前激活模型的状态
const syncModelState = async () => {
  modelPending.value = true
  const [allModels, activeModel] = await Promise.all([
    window.electronAPI.listModels(),
    window.electronAPI.getActiveModel(),
  ]).finally(() => {
    modelPending.value = false
  })

  models.value = allModels.map((item) => ({
    value: item.id,
    label: `${item.name}（${item.source === 'builtin' ? '默认' : '自定义'}）`,
    source: item.source,
  }))
  activeModelId.value = activeModel.id
}

const handleImportModel = async () => {
  modelPending.value = true
  try {
    const imported = await window.electronAPI.importModel()
    if (!imported) {
      return
    }

    await syncModelState()
    toast.success?.('模型导入成功，已切换到新模型。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型导入失败'
    toast.error?.(message)
  } finally {
    modelPending.value = false
  }
}

const handleModelSwitch = async (value: string) => {
  if (!value || value === activeModelId.value) {
    return
  }

  modelPending.value = true
  try {
    // 通知主界面切换模型
    await window.electronAPI.setActiveModel(value)
    // 重新加载模型列表和当前激活模型状态，确保界面与实际状态同步
    await syncModelState()
    toast.success?.('模型已切换。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型切换失败'
    toast.error?.(message)
  } finally {
    modelPending.value = false
  }
}

const handleDeleteActiveModel = async () => {
  const model = activeModel.value
  if (!model || model.source !== 'custom') {
    return
  }

  modal.warning?.('确定要删除当前模型吗？', {
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      modelPending.value = true
      try {
        await window.electronAPI.deleteModel(model.value)
        await syncModelState()
        toast.success?.('自定义模型已删除。')
      } catch (error) {
        const message = error instanceof Error ? error.message : '模型删除失败'
        toast.error?.(message)
      } finally {
        modelPending.value = false
      }
    },
  })
}

const handleSubmit = async () => {
  const payload = await buildAgentSavePayload()
  if (!payload) {
    return
  }

  submitting.value = true
  try {
    const result = await saveAgentConfig(payload)
    assignAgentForm(toAgentForm(result.agent))
    toast.success?.(
      `Agent 配置已保存，USER.md / AGENT.md / SOUL.md 已写入 ${result.workspacePath}`
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '保存 Agent 配置失败'
    toast.error?.(message)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  // 同步加载模型状态和 Agent 配置，两个操作并行进行，等待都完成后再结束 loading 状态
  Promise.all([syncModelState(), loadAgentSettings()]).catch((error) => {
    const message = error instanceof Error ? error.message : '配置加载失败'
    toast.error?.(message)
  })
})
</script>
