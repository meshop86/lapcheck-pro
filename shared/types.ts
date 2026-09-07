/**
 * Kieu du lieu dung chung giua Electron main process va renderer (React).
 * Moi thay doi o day deu anh huong ca hai phia -> giu on dinh.
 */

/* ------------------------------------------------------------------ */
/* 1. HO SO PHAN CUNG (SYSTEM PROFILE)                                 */
/* ------------------------------------------------------------------ */

export type Platform = 'win32' | 'darwin' | 'linux'

export interface MachineInfo {
  manufacturer: string
  model: string
  sku: string
  version: string
  serial: string
  uuid: string
  chassisType: string
  biosVendor: string
  biosVersion: string
  biosReleaseDate: string
  osDistro: string
  osRelease: string
  osBuild: string
  osArch: string
  hostname: string
  /** Windows: OEM_DM | Retail | Volume_MAK ... macOS: null */
  licenseChannel: string | null
  licenseActivated: boolean | null
  secureBoot: boolean | null
  tpmVersion: string | null
  /** Ngay san xuat suy ra tu serial/BIOS neu doc duoc */
  estimatedManufactureDate: string | null
}

export interface CpuInfo {
  manufacturer: string
  brand: string
  family: string
  model: string
  stepping: string
  socket: string
  physicalCores: number
  logicalCores: number
  performanceCores: number | null
  efficiencyCores: number | null
  baseSpeedGHz: number | null
  maxSpeedGHz: number | null
  cacheL1dBytes: number | null
  cacheL2Bytes: number | null
  cacheL3Bytes: number | null
  virtualizationEnabled: boolean | null
}

export interface MemoryModule {
  slot: string
  bank: string
  sizeBytes: number
  type: string
  clockSpeedMHz: number | null
  configuredClockMHz: number | null
  manufacturer: string
  partNumber: string
  serialNumber: string
  voltage: number | null
  formFactor: string
  ecc: boolean | null
}

export interface MemoryInfo {
  totalBytes: number
  freeBytes: number
  usedBytes: number
  swapTotalBytes: number
  slotsTotal: number | null
  slotsUsed: number
  modules: MemoryModule[]
}

export interface SmartAttribute {
  id: number
  name: string
  value: number
  worst: number | null
  threshold: number | null
  raw: string
}

export interface SmartData {
  available: boolean
  source: 'smartctl' | 'wmi' | 'macos' | null
  healthy: boolean | null
  /** So gio o cung da chay - chi so quan trong nhat voi may cu */
  powerOnHours: number | null
  powerCycles: number | null
  /** Tong so byte da ghi (TBW) - do do mon cua SSD */
  dataWrittenBytes: number | null
  dataReadBytes: number | null
  /** NVMe: % tuoi tho da dung (0 = moi, 100 = het bao hanh do ben) */
  percentageUsed: number | null
  temperatureC: number | null
  reallocatedSectors: number | null
  pendingSectors: number | null
  uncorrectableErrors: number | null
  mediaErrors: number | null
  unsafeShutdowns: number | null
  criticalWarning: number | null
  attributes: SmartAttribute[]
  error: string | null
}

export interface StoragePartition {
  mount: string
  fsType: string
  sizeBytes: number
  usedBytes: number
}

export interface StorageDevice {
  device: string
  name: string
  model: string
  vendor: string
  serial: string
  firmware: string
  sizeBytes: number
  type: 'SSD' | 'HDD' | 'NVMe' | 'Unknown'
  interfaceType: string
  removable: boolean
  smart: SmartData
  partitions: StoragePartition[]
}

export interface BatteryInfo {
  hasBattery: boolean
  manufacturer: string
  model: string
  serial: string
  chemistry: string
  designedCapacityMWh: number | null
  maxCapacityMWh: number | null
  currentCapacityMWh: number | null
  /** maxCapacity / designedCapacity * 100 */
  healthPercent: number | null
  /** 100 - healthPercent : muc do chai pin */
  wearPercent: number | null
  cycleCount: number | null
  designCycleCount: number | null
  voltageV: number | null
  /** Duong = dang sac, am = dang xa */
  powerW: number | null
  percent: number | null
  isCharging: boolean
  acConnected: boolean
  timeRemainingMin: number | null
  condition: string | null
}

export interface DisplayInfo {
  index: number
  builtin: boolean
  vendorId: string | null
  vendorName: string | null
  model: string | null
  serialNumber: string | null
  currentResX: number | null
  currentResY: number | null
  nativeResX: number | null
  nativeResY: number | null
  refreshRateHz: number | null
  pixelDepth: number | null
  sizeInches: number | null
  physicalWidthMm: number | null
  physicalHeightMm: number | null
  manufactureWeek: number | null
  manufactureYear: number | null
  connection: string | null
}

export interface GraphicsController {
  vendor: string
  model: string
  vramBytes: number | null
  bus: string
  driverVersion: string
  isDiscrete: boolean
}

export interface NetworkAdapter {
  iface: string
  name: string
  type: 'wifi' | 'ethernet' | 'bluetooth' | 'other'
  mac: string
  vendor: string
  speedMbps: number | null
  driverVersion: string | null
  /** Vi du: ['802.11ax (Wi-Fi 6)', '802.11ac'] */
  standards: string[]
}

export interface AudioDeviceInfo {
  name: string
  manufacturer: string
  type: string
  isInput: boolean
  isOutput: boolean
  isDefault: boolean
}

export interface SystemProfile {
  collectedAt: string
  platform: Platform
  /** True neu app dang chay voi quyen admin/root -> doc duoc SMART, cam bien */
  privileged: boolean
  appVersion: string
  machine: MachineInfo
  cpu: CpuInfo
  memory: MemoryInfo
  storage: StorageDevice[]
  battery: BatteryInfo
  displays: DisplayInfo[]
  graphics: GraphicsController[]
  network: NetworkAdapter[]
  audio: AudioDeviceInfo[]
  /** Cac loi khong chan quy trinh, hien thi de ky thuat vien biet du lieu nao thieu */
  warnings: string[]
}

/* ------------------------------------------------------------------ */
/* 2. CAM BIEN THOI GIAN THUC                                          */
/* ------------------------------------------------------------------ */

export interface FanReading {
  name: string
  rpm: number | null
  percent: number | null
}

export interface SensorSnapshot {
  timestamp: number
  cpuLoadPercent: number
  cpuTempC: number | null
  gpuTempC: number | null
  cpuFreqGHz: number | null
  memoryUsedPercent: number
  fans: FanReading[]
  powerW: number | null
  batteryPercent: number | null
  /**
   * Muc ap luc nhiet do macOS bao cao (Nominal / Fair / Serious / Critical).
   * Apple Silicon khong cho doc nhiet do die, day la tin hieu throttle thay the.
   */
  thermalPressure: string | null
}

/* ------------------------------------------------------------------ */
/* 3. BAI TEST                                                         */
/* ------------------------------------------------------------------ */

export type TestCategory =
  | 'input'
  | 'display'
  | 'audio'
  | 'camera'
  | 'storage'
  | 'thermal'
  | 'battery'
  | 'connectivity'
  | 'physical'

export type TestStatus = 'pending' | 'running' | 'passed' | 'warning' | 'failed' | 'skipped'

export interface TestResult {
  id: string
  name: string
  category: TestCategory
  status: TestStatus
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  /** Mot dong ket luan tieng Viet cho ky thuat vien */
  summary: string
  /** So lieu do duoc, dua thang vao bao cao PDF */
  metrics: Record<string, string | number>
  notes: string
}

/* ------------------------------------------------------------------ */
/* 4. CHAN DOAN & CHAM DIEM                                            */
/* ------------------------------------------------------------------ */

export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info'

export interface Finding {
  code: string
  severity: FindingSeverity
  title: string
  detail: string
  evidence: string | null
  recommendation: string | null
}

export type GradeLetter = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'

export interface Grade {
  score: number
  letter: GradeLetter
  label: string
  /** Diem tru theo tung hang muc, de giai thich vi sao bi ha diem */
  deductions: { reason: string; points: number }[]
}

/* ------------------------------------------------------------------ */
/* 5. PHIEN KIEM DINH                                                  */
/* ------------------------------------------------------------------ */

export interface InspectionMeta {
  technician: string
  customerRef: string
  deviceLabel: string
  condition: 'new' | 'used' | 'refurbished'
  notes: string
}

export interface Inspection {
  id: string
  createdAt: string
  meta: InspectionMeta
  profile: SystemProfile
  results: TestResult[]
  findings: Finding[]
  grade: Grade
}

export interface InspectionSummaryRow {
  id: string
  createdAt: string
  deviceLabel: string
  serial: string
  technician: string
  gradeLetter: GradeLetter
  score: number
  passed: number
  failed: number
  total: number
}

/* ------------------------------------------------------------------ */
/* 6. TIEN ICH CHAN DOAN CHAY O MAIN PROCESS                           */
/* ------------------------------------------------------------------ */

export interface DiskBenchOptions {
  targetDir: string
  /** Kich thuoc file test, mac dinh 512 MB */
  fileSizeMB: number
  blockSizeKB: number
}

export interface DiskBenchResult {
  targetDir: string
  fileSizeMB: number
  seqWriteMBps: number
  seqReadMBps: number
  randomWriteIOPS: number
  randomReadIOPS: number
  randomReadLatencyMs: number
  durationMs: number
}

export interface StressOptions {
  durationSec: number
  /** So luong worker; mac dinh = so logical core */
  threads: number
}

export interface StressResult {
  durationSec: number
  threads: number
  totalOps: number
  opsPerSec: number
  maxCpuTempC: number | null
  avgCpuTempC: number | null
  maxFanRpm: number | null
  startFreqGHz: number | null
  minFreqGHz: number | null
  /** % tut xung so voi luc bat dau -> dau hieu throttling do nhiet */
  throttlePercent: number | null
  errors: number
  timeline: SensorSnapshot[]
}

export interface MemoryTestOptions {
  sizeMB: number
  passes: number
}

export interface MemoryTestResult {
  sizeMB: number
  passes: number
  errors: number
  throughputMBps: number
  durationMs: number
  patternsRun: string[]
}

export interface ProgressEvent {
  jobId: string
  phase: string
  percent: number
  message: string
}

export interface IpcResult<T> {
  ok: boolean
  data: T | null
  error: string | null
}
