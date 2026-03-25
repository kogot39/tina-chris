/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ElectronAPI {
  minimize: () => void
  close: () => void
  setAlwaysOnTop: (value: boolean) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
