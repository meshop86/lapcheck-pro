/** Ten kenh IPC dung chung. Dung hang so de tranh go sai chuoi. */
export const IPC = {
  appInfo: 'app:info',
  systemProfile: 'system:profile',
  sensorSnapshot: 'sensor:snapshot',
  sensorStart: 'sensor:start',
  sensorStop: 'sensor:stop',
  sensorData: 'sensor:data',
  sensorRequestAccess: 'sensor:request-access',

  diagDiskBench: 'diag:disk-bench',
  diagCpuStress: 'diag:cpu-stress',
  diagMemoryTest: 'diag:memory-test',
  diagCancel: 'diag:cancel',
  diagProgress: 'diag:progress',

  dbSave: 'db:save',
  dbList: 'db:list',
  dbGet: 'db:get',
  dbDelete: 'db:delete',

  reportExportPdf: 'report:export-pdf',
  shellOpenPath: 'shell:open-path',
  shellOpenExternal: 'shell:open-external'
} as const

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  arch: string
  electron: string
  privileged: boolean
  /** macOS: da cap quyen doc cam bien qua hop thoai mat khau (app van chay quyen thuong) */
  sensorAccess: boolean
  /** Duong dan thu muc mac dinh de luu bao cao */
  reportsDir: string
}
