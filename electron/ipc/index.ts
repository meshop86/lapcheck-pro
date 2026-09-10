import { app, ipcMain, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC, type AppInfo } from '@shared/ipc'
import type {
  DiskBenchOptions,
  Inspection,
  IpcResult,
  MemoryTestOptions,
  ProgressEvent,
  StressOptions
} from '@shared/types'
import { collectSystemProfile, isPrivileged } from '../hardware'
import { readSensors, sensorMonitor } from '../hardware/sensors'
import { runDiskBenchmark } from '../diagnostics/diskBench'
import { runCpuStress } from '../diagnostics/cpuStress'
import { runMemoryTest } from '../diagnostics/memoryTest'
import * as db from '../db'
import { exportInspectionPdf } from '../report/pdf'

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data, error: null })
const fail = <T>(error: unknown): IpcResult<T> => ({
  ok: false,
  data: null,
  error: error instanceof Error ? error.message : String(error)
})

/** Bọc handler để lỗi ở main không làm treo giao diện. */
function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return ok(await fn(event, ...(args as TArgs)))
    } catch (err) {
      return fail(err)
    }
  })
}

const runningJobs = new Map<string, AbortController>()

function progressReporter(event: Electron.IpcMainInvokeEvent, jobId: string) {
  return (phase: string, percent: number, message: string): void => {
    if (event.sender.isDestroyed()) return
    const payload: ProgressEvent = { jobId, phase, percent, message }
    event.sender.send(IPC.diagProgress, payload)
  }
}

export function reportsDir(): string {
  return join(app.getPath('documents'), 'chipLapTest Reports')
}

/** Thư mục chứa công cụ đi kèm (smartctl...) khi app đã đóng gói. */
function bundledBinDir(): string {
  const folder = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', folder)
    : join(app.getAppPath(), 'resources', 'bin', folder)
}

export function registerIpcHandlers(): void {
  db.initDatabase(app.getPath('userData'))

  handle(IPC.appInfo, async (): Promise<AppInfo> => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    privileged: await isPrivileged(),
    reportsDir: reportsDir()
  }))

  handle(IPC.systemProfile, (_e, force?: boolean) =>
    collectSystemProfile({
      appVersion: app.getVersion(),
      bundledBinDir: bundledBinDir(),
      force: Boolean(force)
    })
  )

  handle(IPC.sensorSnapshot, () => readSensors())

  /* --- Luồng cảm biến theo thời gian thực --- */

  const sensorSubscriptions = new Map<number, () => void>()

  ipcMain.on(IPC.sensorStart, (event) => {
    const id = event.sender.id
    if (sensorSubscriptions.has(id)) return
    const unsubscribe = sensorMonitor.subscribe((snapshot) => {
      if (event.sender.isDestroyed()) {
        unsubscribe()
        sensorSubscriptions.delete(id)
        return
      }
      event.sender.send(IPC.sensorData, snapshot)
    })
    sensorSubscriptions.set(id, unsubscribe)
  })

  ipcMain.on(IPC.sensorStop, (event) => {
    sensorSubscriptions.get(event.sender.id)?.()
    sensorSubscriptions.delete(event.sender.id)
  })

  /* --- Các bài đo chạy ở main process --- */

  handle(IPC.diagDiskBench, async (event, jobId: string, options: DiskBenchOptions) => {
    const target = options.targetDir || app.getPath('temp')
    return runDiskBenchmark({ ...options, targetDir: target }, progressReporter(event, jobId))
  })

  handle(IPC.diagCpuStress, async (event, jobId: string, options: StressOptions) => {
    const controller = new AbortController()
    runningJobs.set(jobId, controller)
    try {
      return await runCpuStress(options, progressReporter(event, jobId), controller.signal)
    } finally {
      runningJobs.delete(jobId)
    }
  })

  handle(IPC.diagMemoryTest, (event, jobId: string, options: MemoryTestOptions) =>
    runMemoryTest(options, progressReporter(event, jobId))
  )

  ipcMain.on(IPC.diagCancel, (_e, jobId: string) => {
    runningJobs.get(jobId)?.abort()
  })

  /* --- Lưu trữ --- */

  handle(IPC.dbSave, (_e, inspection: Inspection) => {
    const record: Inspection = { ...inspection, id: inspection.id || randomUUID() }
    db.saveInspection(record)
    return record.id
  })

  handle(IPC.dbList, () => db.listInspections())
  handle(IPC.dbGet, (_e, id: string) => db.getInspection(id))
  handle(IPC.dbDelete, (_e, id: string) => db.deleteInspection(id))

  /* --- Báo cáo --- */

  handle(IPC.reportExportPdf, async (_e, inspection: Inspection) =>
    exportInspectionPdf(inspection, reportsDir())
  )

  handle(IPC.shellOpenPath, (_e, path: string) => shell.openPath(path))

  ipcMain.on(IPC.shellOpenExternal, (_e, url: string) => {
    // Chỉ mở liên kết http(s) để tránh bị lợi dụng chạy lệnh hệ thống
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  app.on('browser-window-created', (_e, window: BrowserWindow) => {
    window.on('closed', () => {
      sensorSubscriptions.forEach((unsubscribe) => unsubscribe())
      sensorSubscriptions.clear()
    })
  })
}
