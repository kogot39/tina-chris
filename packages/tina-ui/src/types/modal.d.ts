import type { ModalApi } from '../plugins/modalPlugin'

declare module 'vue' {
  interface ComponentCustomProperties {
    $modal: ModalApi
  }
}

export {}
