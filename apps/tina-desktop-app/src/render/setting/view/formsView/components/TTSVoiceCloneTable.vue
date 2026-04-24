<template>
  <FieldsetLayout :show-actions="true">
    <template #default>
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">远端音色列表</h2>
          <p class="text-xs opacity-70">
            复制 voice 名称后，可手动填写到 TTS 配置表单中的音色字段。
          </p>
        </div>
      </div>

      <DataTable
        :columns="columns"
        :rows="voices"
        :loading="loading"
        row-key="voice"
        empty-text="当前还没有可用的远端音色，或当前 API Key 无法读取音色列表。"
      >
        <template #cell-voice="{ value }">
          <span class="font-mono text-sm">{{ value }}</span>
        </template>

        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-2">
            <BaseButton
              type="soft"
              size="sm"
              :disabled="loading"
              @click="emit('copy', String(row.voice || ''))"
            >
              复制音色名
            </BaseButton>
            <BaseButton
              type="soft"
              size="sm"
              color="error"
              :disabled="loading"
              @click="emit('delete', String(row.voice || ''))"
            >
              删除
            </BaseButton>
          </div>
        </template>
      </DataTable>
    </template>

    <template #actions="{ disabled }">
      <div class="flex w-full items-center justify-between gap-2">
        <BaseButton
          type="soft"
          :disabled="disabled || loading"
          @click="emit('back')"
        >
          返回配置
        </BaseButton>
        <BaseButton
          type="soft"
          :disabled="disabled || loading"
          @click="emit('refresh')"
        >
          刷新列表
        </BaseButton>
      </div>
    </template>
  </FieldsetLayout>
</template>

<script setup lang="ts">
// 音色表格组件，展示远端音色列表，并提供复制音色名和删除音色的操作
import { BaseButton, DataTable, FieldsetLayout } from '@tina-chris/tina-ui'

import type { TTSVoiceCloneItem, VoiceTableColumn } from '../../../../../shared'

withDefaults(
  defineProps<{
    voices: TTSVoiceCloneItem[]
    loading?: boolean
  }>(),
  {
    loading: false,
  }
)

const emit = defineEmits<{
  back: []
  refresh: []
  copy: [voice: string]
  delete: [voice: string]
}>()

// 定义表格列配置
const columns: VoiceTableColumn[] = [
  { key: 'voice', title: '音色名', width: '30%' },
  { key: 'target_model', title: '目标模型', width: '30%' },
  { key: 'gmt_create', title: '创建时间', width: '20%' },
  { key: 'actions', title: '操作', width: '20%', align: 'left' },
]
</script>
