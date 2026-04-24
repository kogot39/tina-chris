import { type App, type Plugin, createApp, h, reactive } from 'vue'
import { Modal } from '../components'

export type ModalType = 'default' | 'info' | 'success' | 'warning' | 'error'

export type ModalOptions = {
  title?: string
  content?: string
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void | Promise<void>
  width?: string | number
  height?: string | number
  closeOnBackdrop?: boolean
  showActions?: boolean
  showCancel?: boolean
  confirmText?: string
  cancelText?: string
  zIndex?: number
  type?: ModalType
}

export type ModalResult = 'confirm' | 'cancel' | 'backdrop' | 'programmatic'

export type ModalApi = {
  show: (options?: ModalOptions) => Promise<ModalResult>
  info: (
    content: string,
    options?: Omit<ModalOptions, 'content' | 'type'>
  ) => Promise<ModalResult>
  success: (
    content: string,
    options?: Omit<ModalOptions, 'content' | 'type'>
  ) => Promise<ModalResult>
  warning: (
    content: string,
    options?: Omit<ModalOptions, 'content' | 'type'>
  ) => Promise<ModalResult>
  error: (
    content: string,
    options?: Omit<ModalOptions, 'content' | 'type'>
  ) => Promise<ModalResult>
  closeAll: () => void
}

type ModalEntry = {
  id: string
  app: App
  container: HTMLDivElement
  state: {
    visible: boolean
    title: string
    content: string
    width?: string | number
    height?: string | number
    closeOnBackdrop: boolean
    showActions: boolean
    showCancel: boolean
    confirmText: string
    cancelText: string
    zIndex: number
  }
  resolve: (result: ModalResult) => void
  done: boolean
}
// TODO: 针对不同类型设计不同的默认样式和图标，目前先用统一的简洁风格，后续根据需要再丰富。
const DEFAULT_TITLE_MAP: Record<ModalType, string> = {
  default: '提示',
  info: '信息',
  success: '成功',
  warning: '警告',
  error: '错误',
}

const entries: ModalEntry[] = []
let idSeed = 0

const removeModal = (id: string) => {
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return

  const [entry] = entries.splice(index, 1)
  entry.app.unmount()
  if (entry.container.parentNode) {
    entry.container.parentNode.removeChild(entry.container)
  }
}

export const createModal = (): ModalApi => {
  const show = (options: ModalOptions = {}) => {
    const id = `modal_${++idSeed}`
    const container = document.createElement('div')
    document.body.appendChild(container)

    const type = options.type || 'default'
    const state = reactive({
      visible: true,
      title: options.title || DEFAULT_TITLE_MAP[type],
      content: options.content || '',
      width: options.width,
      height: options.height,
      closeOnBackdrop: options.closeOnBackdrop ?? true,
      showActions: options.showActions ?? true,
      showCancel: options.showCancel ?? true,
      confirmText: options.confirmText || '确认',
      cancelText: options.cancelText || '取消',
      zIndex: options.zIndex || 3000,
    })

    return new Promise<ModalResult>((resolve) => {
      const finalize = (result: ModalResult) => {
        const entry = entries.find((item) => item.id === id)
        if (!entry || entry.done) return
        entry.done = true
        entry.resolve(result)
      }

      const closeAndCleanup = (result: ModalResult) => {
        const entry = entries.find((item) => item.id === id)
        if (!entry || entry.done) return

        finalize(result)
        state.visible = false
        window.setTimeout(() => removeModal(id), 200)
      }

      const app = createApp({
        setup() {
          return () =>
            h(Modal, {
              visible: state.visible,
              title: state.title,
              content: state.content,
              width: state.width,
              height: state.height,
              closeOnBackdrop: state.closeOnBackdrop,
              showActions: state.showActions,
              showCancel: state.showCancel,
              confirmText: state.confirmText,
              cancelText: state.cancelText,
              zIndex: state.zIndex,
              'onUpdate:visible': (value: boolean) => {
                state.visible = value
                if (!value) {
                  closeAndCleanup('programmatic')
                }
              },
              onConfirm: () => {
                options.onConfirm?.()
                closeAndCleanup('confirm')
              },
              onCancel: () => {
                options.onCancel?.()
                closeAndCleanup('cancel')
              },
              onClose: (reason: ModalResult) => {
                if (reason === 'backdrop') {
                  options.onCancel?.()
                  closeAndCleanup('backdrop')
                }
              },
            })
        },
      })

      app.mount(container)

      entries.push({
        id,
        app,
        container,
        state,
        resolve,
        done: false,
      })
    })
  }

  const showByType = (
    type: Exclude<ModalType, 'default'>,
    content: string,
    options: Omit<ModalOptions, 'content' | 'type'> = {}
  ) => {
    return show({
      ...options,
      type,
      content,
    })
  }

  return {
    show,
    info: (content, options) => showByType('info', content, options),
    success: (content, options) => showByType('success', content, options),
    warning: (content, options) => showByType('warning', content, options),
    error: (content, options) => showByType('error', content, options),
    closeAll: () => {
      const ids = entries.map((entry) => entry.id)
      ids.forEach((id) => {
        const entry = entries.find((item) => item.id === id)
        if (!entry || entry.done) return
        entry.state.visible = false
        entry.resolve('programmatic')
        entry.done = true
        window.setTimeout(() => removeModal(id), 200)
      })
    },
  }
}

export const modalPlugin: Plugin = {
  install(app) {
    const modal = createModal()
    app.config.globalProperties.$modal = modal
    app.provide('modal', modal)
  },
}
