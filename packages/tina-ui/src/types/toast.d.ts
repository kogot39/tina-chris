import type { ToastApi } from '../plugins/toastPlugin'

declare module 'vue' {
  interface ComponentCustomProperties {
    $toast: ToastApi
  }
}

export {}
