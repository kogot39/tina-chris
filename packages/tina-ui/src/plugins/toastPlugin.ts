import { type App, type Plugin, createApp, h, reactive } from 'vue'
import { Toast } from '../components'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export type ToastOptions = {
  type?: ToastType
  message: string
  duration?: number
}

export type ToastApi = {
  show: (options: ToastOptions) => string
  success: (message: string, duration?: number) => string
  error: (message: string, duration?: number) => string
  info: (message: string, duration?: number) => string
  warning: (message: string, duration?: number) => string
  clear: () => void
}

type ToastEntry = {
  id: string
  container: HTMLDivElement
  app: App
  height: number
  state: {
    type: ToastType
    message: string
    duration: number
    offsetY: number
    zIndex: number
  }
}

const DEFAULT_DURATION = 3000
const STACK_GAP = 12
const STACK_HEIGHT = 72
let idSeed = 0

const entries: ToastEntry[] = []

const getToastHeight = (id: string, fallbackHeight = STACK_HEIGHT) => {
  const node = document.querySelector<HTMLElement>(`[data-toast-id="${id}"]`)
  if (!node) return fallbackHeight
  return node.offsetHeight || fallbackHeight
}

const updateStackOffsets = () => {
  // New toast stays at top; older ones shift down to avoid overlap.
  let accumulatedOffset = 0
  entries.forEach((entry, index) => {
    entry.height = getToastHeight(entry.id, entry.height)
    entry.state.offsetY = accumulatedOffset
    entry.state.zIndex = 2000 - index
    accumulatedOffset += entry.height + STACK_GAP
  })
}

const removeToast = (id: string) => {
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return

  const [entry] = entries.splice(index, 1)
  entry.app.unmount()
  if (entry.container.parentNode) {
    entry.container.parentNode.removeChild(entry.container)
  }

  updateStackOffsets()
}

export const createToast = (): ToastApi => {
  const show = ({
    type = 'info',
    message,
    duration = DEFAULT_DURATION,
  }: ToastOptions) => {
    const id = `toast_${++idSeed}`
    const container = document.createElement('div')
    document.body.appendChild(container)

    const state = reactive({
      type,
      message,
      duration,
      offsetY: 0,
      zIndex: 2000,
    })

    const app = createApp({
      setup() {
        const handleClose = () => {
          // Wait for transition before unmounting.
          window.setTimeout(() => removeToast(id), 300)
        }

        return () =>
          h(Toast, {
            toastId: id,
            type: state.type,
            message: state.message,
            duration: state.duration,
            offsetY: state.offsetY,
            zIndex: state.zIndex,
            onClose: handleClose,
          })
      },
    })

    app.mount(container)

    entries.unshift({
      id,
      container,
      app,
      height: STACK_HEIGHT,
      state,
    })

    updateStackOffsets()
    window.requestAnimationFrame(() => {
      updateStackOffsets()
    })
    return id
  }

  return {
    show,
    success: (message, duration) =>
      show({ type: 'success', message, duration }),
    error: (message, duration) => show({ type: 'error', message, duration }),
    info: (message, duration) => show({ type: 'info', message, duration }),
    warning: (message, duration) =>
      show({ type: 'warning', message, duration }),
    clear: () => {
      const ids = entries.map((entry) => entry.id)
      ids.forEach((id) => removeToast(id))
    },
  }
}

export const toastPlugin: Plugin = {
  install(app) {
    const toast = createToast()
    app.config.globalProperties.$toast = toast
    app.provide('toast', toast)
  },
}
