import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setClickThrough: (enabled: boolean) =>
    ipcRenderer.invoke('window:set-click-through', enabled),
  setAlwaysOnTop: (enabled: boolean) =>
    ipcRenderer.invoke('window:set-always-on-top', enabled),
})
