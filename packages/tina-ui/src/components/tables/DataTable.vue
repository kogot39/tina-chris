<template>
  <div class="rounded-box border border-base-300 bg-base-100 shadow-sm">
    <div class="overflow-x-auto">
      <table class="table table-fixed" :class="{ 'table-zebra': striped }">
        <thead class="bg-base-200/70 text-base-content">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="[resolveAlignClass(column.align), column.headerClass]"
              :style="{ width: column.width }"
            >
              {{ column.title }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td :colspan="columns.length" class="py-10 text-center">
              <span class="loading loading-spinner loading-md text-primary" />
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td
              :colspan="columns.length"
              class="py-10 text-center text-sm opacity-70"
            >
              {{ emptyText }}
            </td>
          </tr>
          <tr
            v-for="(row, index) in rows"
            v-else
            :key="resolveRowKey(row, index)"
            class="hover:bg-base-200/40 transition-colors"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              :class="[resolveAlignClass(column.align), column.cellClass]"
            >
              <slot
                :name="getCellSlotName(column.key)"
                :row="row"
                :column="column"
                :value="getCellValue(row, column.key)"
                :index="index"
              >
                <span class="whitespace-pre-wrap wrap-break-words">
                  {{ getCellValue(row, column.key) }}
                </span>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DataTableColumn, DataTableRow } from './types'

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[]
    rows: DataTableRow[]
    rowKey?: string | ((row: DataTableRow, index: number) => string | number)
    loading?: boolean
    emptyText?: string
    striped?: boolean
  }>(),
  {
    rowKey: 'id',
    loading: false,
    emptyText: '暂无数据',
    striped: true,
  }
)

// 获取单元格插槽名称，例如列 key 为 "name"，则对应的插槽名称为 "cell-name"。
const getCellSlotName = (key: string) => {
  return `cell-${key}`
}

const getCellValue = (row: DataTableRow, key: string): unknown => {
  return row[key]
}

const resolveRowKey = (row: DataTableRow, index: number): string | number => {
  if (typeof props.rowKey === 'function') {
    return props.rowKey(row, index)
  }

  const candidate = row[props.rowKey]
  return typeof candidate === 'string' || typeof candidate === 'number'
    ? candidate
    : index
}

const resolveAlignClass = (align?: DataTableColumn['align']) => {
  if (align === 'center') {
    return 'text-center'
  }
  if (align === 'right') {
    return 'text-right'
  }
  return 'text-left'
}
</script>
