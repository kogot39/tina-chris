import { join } from 'path'
import { BrowserWindow, app } from 'electron'
import { is } from '@electron-toolkit/utils'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      webSecurity: false,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../../src/render/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
})
