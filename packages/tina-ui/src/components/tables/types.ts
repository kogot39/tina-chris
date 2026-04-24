export type DataTableColumn = {
  key: string
  title: string
  width?: string
  align?: 'left' | 'center' | 'right'
  headerClass?: string
  cellClass?: string
}

export type DataTableRow = Record<string, unknown>
