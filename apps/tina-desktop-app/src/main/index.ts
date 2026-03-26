import { join } from 'path'
import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { is } from '@electron-toolkit/utils'

function createWindow(): void {
  const { width, height, x, y } = screen.getPrimaryDisplay().bounds

  const mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    autoHideMenuBar: true,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    // 避免视频停止播放
    type: 'toolbar',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      webSecurity: false,
    },
  })

  mainWindow.webContents.openDevTools()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../../src/render/index.html'))
  }

  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setAlwaysOnTop(true, 'floating')

  mainWindow.once('ready-to-show', () => {
    mainWindow.showInactive()
  })

  ipcMain.handle('window:set-click-through', (_e, enabled: boolean) => {
    if (!mainWindow) return false
    mainWindow.setIgnoreMouseEvents(enabled, { forward: true })
    mainWindow.setFocusable(false)
    return true
  })

  ipcMain.handle('window:set-always-on-top', (_e, enabled: boolean) => {
    if (!mainWindow) return false
    mainWindow.setAlwaysOnTop(enabled, 'floating')
    return true
  })
}

app.whenReady().then(() => {
  createWindow()
})
