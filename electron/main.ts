import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b1220',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Bài test loa/mic/webcam cần các API media của trình duyệt
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // Mọi liên kết ngoài mở bằng trình duyệt hệ thống, không mở cửa sổ Electron mới
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  // Windows lay ten hien tren thanh tac vu va thong bao tu ID nay
  app.setAppUserModelId('com.chiplaptest.app')

  // Bài test micro và webcam cần quyền truy cập thiết bị
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'fullscreen', 'pointerLock'].includes(permission))
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
