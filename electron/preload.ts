import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'
import type {
  DiskBenchOptions,
  DiskBenchResult,
  Inspection,
  InspectionSummaryRow,
  IpcResult,
  MemoryTestOptions,
  MemoryTestResult,
  ProgressEvent,
  SensorSnapshot,
  StressOptions,
  StressResult,
  SystemProfile
} from '@shared/types'

/** Gọi IPC và ném lỗi ở phía renderer nếu main báo thất bại. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error ?? 'Lỗi không xác định')
  return result.data as T
}

const api = {
  getAppInfo: () => invoke<AppInfo>(IPC.appInfo),
  getSystemProfile: (force = false) => invoke<SystemProfile>(IPC.systemProfile, force),
  getSensorSnapshot: () => invoke<SensorSnapshot>(IPC.sensorSnapshot),

  startSensorStream: (onData: (snapshot: SensorSnapshot) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, snapshot: SensorSnapshot): void => onData(snapshot)
    ipcRenderer.on(IPC.sensorData, listener)
    ipcRenderer.send(IPC.sensorStart)
    return () => {
      ipcRenderer.removeListener(IPC.sensorData, listener)
      ipcRenderer.send(IPC.sensorStop)
    }
  },

  onProgress: (onEvent: (event: ProgressEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: ProgressEvent): void => onEvent(payload)
    ipcRenderer.on(IPC.diagProgress, listener)
    return () => ipcRenderer.removeListener(IPC.diagProgress, listener)
  },

  runDiskBenchmark: (jobId: string, options: DiskBenchOptions) =>
    invoke<DiskBenchResult & { cacheDropped: boolean }>(IPC.diagDiskBench, jobId, options),
  runCpuStress: (jobId: string, options: StressOptions) =>
    invoke<StressResult>(IPC.diagCpuStress, jobId, options),
  runMemoryTest: (jobId: string, options: MemoryTestOptions) =>
    invoke<MemoryTestResult>(IPC.diagMemoryTest, jobId, options),
  cancelJob: (jobId: string): void => ipcRenderer.send(IPC.diagCancel, jobId),

  saveInspection: (inspection: Inspection) => invoke<string>(IPC.dbSave, inspection),
  listInspections: () => invoke<InspectionSummaryRow[]>(IPC.dbList),
  getInspection: (id: string) => invoke<Inspection | null>(IPC.dbGet, id),
  deleteInspection: (id: string) => invoke<boolean>(IPC.dbDelete, id),

  exportPdf: (inspection: Inspection) => invoke<string>(IPC.reportExportPdf, inspection),
  openPath: (path: string) => invoke<string>(IPC.shellOpenPath, path),
  openExternal: (url: string): void => ipcRenderer.send(IPC.shellOpenExternal, url)
}

export type LapCheckApi = typeof api

contextBridge.exposeInMainWorld('lapcheck', api)
