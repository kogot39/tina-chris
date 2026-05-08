<template>
  <div class="h-full w-full overflow-hidden">
    <div
      class="flex h-full w-[300%] transition-transform duration-300 ease-out"
      :style="sliderStyle"
    >
      <!-- 音色列表 -->
      <section class="h-full basis-1/3 shrink-0">
        <TTSVoiceCloneTable
          :voices="voiceClones"
          :loading="loading"
          @back="showConfigPanel"
          @refresh="reloadClones"
          @copy="copyVoice"
          @delete="deleteVoice"
        />
      </section>
      <!-- TTS 配置表单 -->
      <section class="h-full basis-1/3 shrink-0">
        <DynamicForm
          v-if="schema"
          :schema="schema"
          :values="values"
          :submitting="submitting || loading"
          @update:values="handleValuesUpdate"
          @submit="handleSubmit"
          @invalid="handleInvalid"
        >
          <template #actions="{ saving, disabled, submit }">
            <div class="flex w-full items-center justify-between gap-2">
              <BaseButton
                v-if="hasVoiceCloneCapability"
                :disabled="disabled || loading"
                type="soft"
                @click="showVoiceListPanel"
              >
                查看音色列表
              </BaseButton>
              <div v-else />

              <div class="flex items-center gap-2">
                <BaseButton
                  v-if="hasVoiceCloneCapability"
                  type="soft"
                  :disabled="disabled || loading"
                  @click="showClonePanel"
                >
                  声音克隆
                </BaseButton>
                <BaseButton
                  :disabled="disabled || saving"
                  color="primary"
                  @click="submit"
                >
                  <span v-if="saving" class="loading loading-spinner" />
                  {{ schema.saveText || '保存' }}
                </BaseButton>
              </div>
            </div>
          </template>
        </DynamicForm>
      </section>
      <!-- 声音克隆表单 -->
      <section class="h-full basis-1/3 shrink-0">
        <DynamicForm
          v-if="voiceCloneSchema"
          :schema="voiceCloneSchema"
          :values="cloneValues"
          :submitting="cloneSubmitting || loading"
          @update:values="handleCloneValuesUpdate"
          @submit="handleCloneSubmit"
          @invalid="handleInvalid"
        >
          <template #actions="{ saving, disabled, submit }">
            <div class="flex w-full items-center justify-between gap-2">
              <BaseButton
                type="soft"
                :disabled="disabled || loading"
                @click="showConfigPanel"
              >
                返回配置
              </BaseButton>
              <div class="flex items-center gap-2">
                <BaseButton
                  type="soft"
                  :disabled="disabled || loading"
                  @click="showVoiceListPanel"
                >
                  查看音色列表
                </BaseButton>
                <BaseButton
                  type="soft"
                  color="primary"
                  :disabled="disabled || saving"
                  @click="submit"
                >
                  <span v-if="saving" class="loading loading-spinner" />
                  {{ voiceCloneSchema.saveText || '创建音色' }}
                </BaseButton>
              </div>
            </div>
          </template>
        </DynamicForm>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BaseButton, DynamicForm } from '@tina-chris/tina-ui'
import { useTtsConfigForm } from '../../composables/useTtsConfigForm'
import TTSVoiceCloneTable from './components/TTSVoiceCloneTable.vue'

import type {
  DynamicFormSubmitPayload,
  DynamicFormValues,
  FormValidationErrors,
} from '@tina-chris/tina-ui'

type PanelKey = 'voices' | 'config' | 'clone'

const toast = inject<any>('toast')
const modal = inject<any>('modal')
const route = useRoute()
const router = useRouter()

const providerKey = computed(() => String(route.params.providerKey || ''))
const activePanel = ref<PanelKey>('config')

const {
  cloneSubmitting,
  cloneValues,
  createVoiceClone,
  deleteVoiceClone,
  load,
  loading,
  reloadVoiceClones,
  save,
  schema,
  submitting,
  updateCloneValues,
  updateValues,
  values,
  voiceCloneSchema,
  voiceClones,
} = useTtsConfigForm()

const hasVoiceCloneCapability = computed(() => {
  return Boolean(voiceCloneSchema.value)
})

// 根据当前激活的面板动态计算滑动容器的 transform 样式，实现面板切换时的滑动动画效果
const sliderStyle = computed(() => {
  const panelToOffset: Record<PanelKey, string> = {
    voices: 'translateX(0%)',
    config: 'translateX(-33.333333%)',
    clone: 'translateX(-66.666667%)',
  }

  return {
    transform: panelToOffset[activePanel.value],
  }
})

const showConfigPanel = () => {
  activePanel.value = 'config'
}

const showVoiceListPanel = async () => {
  if (!hasVoiceCloneCapability.value) {
    return
  }

  activePanel.value = 'voices'
  await reloadClones()
}

const showClonePanel = () => {
  if (!hasVoiceCloneCapability.value) {
    return
  }

  activePanel.value = 'clone'
}

const loadForm = async () => {
  if (!providerKey.value) {
    toast.error?.('无效的 TTS 平台标识')
    router.replace('/setting/ttsprovider')
    return
  }

  try {
    await load(providerKey.value)
    showConfigPanel()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载 TTS 配置表单失败'
    toast.error?.(message)
  }
}

const saveForm = async (nextValues: DynamicFormValues) => {
  await save(providerKey.value, nextValues)
  toast.success?.('TTS 配置已保存，可在平台卡片开关中启用。')
}

const handleSubmit = async (payload: DynamicFormSubmitPayload) => {
  if (!providerKey.value) {
    toast.error?.('无效的 TTS 平台标识')
    return
  }

  try {
    await saveForm(payload.values)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存 TTS 配置失败'
    toast.error?.(message)
  }
}

const handleCloneSubmit = async (payload: DynamicFormSubmitPayload) => {
  try {
    await createVoiceClone(providerKey.value, payload.values)
    toast.success?.('声音克隆创建成功，已刷新远端音色列表。')
    activePanel.value = 'voices'
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建声音克隆失败'
    toast.error?.(message)
  }
}

const handleInvalid = (errors: FormValidationErrors<DynamicFormValues>) => {
  if (Object.keys(errors).length > 0) {
    toast.warning?.('表单校验未通过。')
  }
}

const handleValuesUpdate = (nextValues: DynamicFormValues) => {
  updateValues(nextValues)
}

const handleCloneValuesUpdate = (nextValues: DynamicFormValues) => {
  updateCloneValues(nextValues)
}

const reloadClones = async () => {
  try {
    await reloadVoiceClones(providerKey.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : '刷新音色列表失败'
    toast.error?.(message)
  }
}

const copyVoice = async (voice: string) => {
  if (!voice) {
    return
  }

  await navigator.clipboard.writeText(voice)
  toast.success?.('音色名已复制')
}

const deleteVoice = async (voice: string) => {
  if (!voice) {
    return
  }

  modal.warning?.(`确定删除音色 ${voice} 吗？`, {
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        await deleteVoiceClone(providerKey.value, voice)
        toast.success?.('音色已删除')
      } catch (error) {
        const message = error instanceof Error ? error.message : '删除音色失败'
        toast.error?.(message)
      }
    },
  })
}

watch(
  () => providerKey.value,
  () => {
    loadForm()
  },
  { immediate: true }
)
</script>
