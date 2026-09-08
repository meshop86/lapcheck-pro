import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import type { SmartAttribute, SmartData } from '@shared/types'
import { parseJson, run, toNum, toStr } from './util'

/** SMART rong: dung khi khong doc duoc gi. */
export function emptySmart(error: string | null = null): SmartData {
  return {
    available: false,
    source: null,
    healthy: null,
    powerOnHours: null,
    powerCycles: null,
    dataWrittenBytes: null,
    dataReadBytes: null,
    percentageUsed: null,
    temperatureC: null,
    reallocatedSectors: null,
    pendingSectors: null,
    uncorrectableErrors: null,
    mediaErrors: null,
    unsafeShutdowns: null,
    criticalWarning: null,
    attributes: [],
    error
  }
}

const SMARTCTL_CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/opt/homebrew/sbin/smartctl',
    '/opt/homebrew/bin/smartctl',
    '/usr/local/sbin/smartctl',
    '/usr/local/bin/smartctl'
  ],
  win32: [
    'C:\\Program Files\\smartmontools\\bin\\smartctl.exe',
    'C:\\Program Files (x86)\\smartmontools\\bin\\smartctl.exe'
  ],
  linux: ['/usr/sbin/smartctl', '/usr/bin/smartctl']
}

let cachedSmartctl: string | null | undefined

/** Tim smartctl: uu tien ban dong goi kem app, roi den ban cai san trong may. */
export function findSmartctl(bundledDir?: string): string | null {
  if (cachedSmartctl !== undefined) return cachedSmartctl
  const exe = platform() === 'win32' ? 'smartctl.exe' : 'smartctl'
  const candidates = [
    ...(bundledDir ? [`${bundledDir}/${exe}`] : []),
    ...(SMARTCTL_CANDIDATES[platform()] ?? [])
  ]
  cachedSmartctl = candidates.find((p) => existsSync(p)) ?? null
  return cachedSmartctl
}

/* ---------- Cau truc JSON cua smartctl (chi lay phan can dung) ---------- */

interface SmartctlJson {
  smart_status?: { passed?: boolean; nvme?: { value?: number } }
  power_on_time?: { hours?: number }
  power_cycle_count?: number
  temperature?: { current?: number }
  nvme_smart_health_information_log?: {
    critical_warning?: number
    temperature?: number
    available_spare?: number
    percentage_used?: number
    data_units_read?: number
    data_units_written?: number
    power_cycles?: number
    power_on_hours?: number
    unsafe_shutdowns?: number
    media_errors?: number
  }
  ata_smart_attributes?: {
    table?: {
      id: number
      name: string
      value: number
      worst?: number
      thresh?: number
      raw?: { value?: number; string?: string }
    }[]
  }
}

/** NVMe: 1 data unit = 1000 x 512 byte (theo dac ta NVMe). */
const NVME_UNIT_BYTES = 512 * 1000

function fromNvme(json: SmartctlJson): SmartData {
  const log = json.nvme_smart_health_information_log ?? {}
  return {
    available: true,
    source: 'smartctl',
    healthy: json.smart_status?.passed ?? null,
    powerOnHours: toNum(log.power_on_hours),
    powerCycles: toNum(log.power_cycles),
    dataWrittenBytes: log.data_units_written ? log.data_units_written * NVME_UNIT_BYTES : null,
    dataReadBytes: log.data_units_read ? log.data_units_read * NVME_UNIT_BYTES : null,
    percentageUsed: toNum(log.percentage_used),
    temperatureC: toNum(log.temperature ?? json.temperature?.current),
    reallocatedSectors: null,
    pendingSectors: null,
    uncorrectableErrors: null,
    mediaErrors: toNum(log.media_errors),
    unsafeShutdowns: toNum(log.unsafe_shutdowns),
    criticalWarning: toNum(log.critical_warning),
    attributes: [],
    error: null
  }
}

/** ID thuoc tinh SMART cua o ATA/SATA can quan tam. */
const ATA = {
  reallocated: 5,
  powerOnHours: 9,
  powerCycles: 12,
  pendingSector: 197,
  uncorrectable: 198,
  ssdLifeLeft: 231,
  wearLeveling: 177,
  totalLbaWritten: 241,
  totalLbaRead: 242,
  temperature: 194
} as const

/**
 * Rut cac chi so quan trong tu bang thuoc tinh SMART cua o ATA/SATA.
 * Dung chung cho ca hai nguon: smartctl va blob WMI cua Windows.
 */
function summarizeAta(
  attributes: SmartAttribute[],
  base: {
    source: SmartData['source']
    healthy: boolean | null
    powerOnHours?: number | null
    powerCycles?: number | null
    temperatureC?: number | null
  }
): SmartData {
  const rawOf = (id: number): number | null => {
    const row = attributes.find((a) => a.id === id)
    if (!row) return null
    // Truong raw doi khi kem chu ("1234 (12 45 0)") -> lay so dau tien
    return toNum(row.raw.split(/[\s(]/)[0])
  }
  const normOf = (id: number): number | null => attributes.find((a) => a.id === id)?.value ?? null

  const lbaWritten = rawOf(ATA.totalLbaWritten)
  const lbaRead = rawOf(ATA.totalLbaRead)
  const lifeLeft = normOf(ATA.ssdLifeLeft) ?? normOf(ATA.wearLeveling)

  return {
    available: true,
    source: base.source,
    healthy: base.healthy,
    powerOnHours: rawOf(ATA.powerOnHours) ?? base.powerOnHours ?? null,
    powerCycles: rawOf(ATA.powerCycles) ?? base.powerCycles ?? null,
    dataWrittenBytes: lbaWritten !== null ? lbaWritten * 512 : null,
    dataReadBytes: lbaRead !== null ? lbaRead * 512 : null,
    percentageUsed: lifeLeft !== null ? 100 - lifeLeft : null,
    temperatureC: rawOf(ATA.temperature) ?? base.temperatureC ?? null,
    reallocatedSectors: rawOf(ATA.reallocated),
    pendingSectors: rawOf(ATA.pendingSector),
    uncorrectableErrors: rawOf(ATA.uncorrectable),
    mediaErrors: null,
    unsafeShutdowns: null,
    criticalWarning: null,
    attributes,
    error: null
  }
}

function fromAta(json: SmartctlJson): SmartData {
  const table = json.ata_smart_attributes?.table ?? []
  const attributes: SmartAttribute[] = table.map((a) => ({
    id: a.id,
    name: a.name,
    value: a.value,
    worst: a.worst ?? null,
    threshold: a.thresh ?? null,
    raw: a.raw?.string ?? String(a.raw?.value ?? '')
  }))
  return summarizeAta(attributes, {
    source: 'smartctl',
    healthy: json.smart_status?.passed ?? null,
    powerOnHours: toNum(json.power_on_time?.hours),
    powerCycles: toNum(json.power_cycle_count),
    temperatureC: toNum(json.temperature?.current)
  })
}

/** Doc SMART bang smartctl (can quyen admin). Tra ve null neu khong dung duoc. */
export async function readSmartctl(device: string, bundledDir?: string): Promise<SmartData | null> {
  const bin = findSmartctl(bundledDir)
  if (!bin) return null
  const res = await run(bin, ['--json=c', '-a', device], 25_000)
  // smartctl dung exit code dang bitmask; bit 0-1 la loi that su, cac bit khac chi la canh bao
  const json = parseJson<SmartctlJson>(res.stdout)
  if (!json) return null
  const data = json.nvme_smart_health_information_log ? fromNvme(json) : fromAta(json)
  if (!data.powerOnHours && !data.attributes.length && data.healthy === null) return null
  return data
}

/* ---------- Du phong tren Windows khi khong co smartctl ---------- */

/**
 * Bang thuoc tinh SMART thô ma Windows tra ve qua WMI (MSStorageDriver_FailurePredictData).
 * Cau truc theo dac ta ATA: 2 byte revision, roi 30 ban ghi 12 byte.
 * Doc duoc bang nay nghia la co day du chi so nhu smartctl, khong can cai them gi.
 */
const ATA_ATTR_NAME: Record<number, string> = {
  1: 'Raw_Read_Error_Rate',
  5: 'Reallocated_Sector_Ct',
  9: 'Power_On_Hours',
  12: 'Power_Cycle_Count',
  177: 'Wear_Leveling_Count',
  187: 'Reported_Uncorrect',
  188: 'Command_Timeout',
  194: 'Temperature_Celsius',
  196: 'Reallocated_Event_Count',
  197: 'Current_Pending_Sector',
  198: 'Offline_Uncorrectable',
  199: 'UDMA_CRC_Error_Count',
  231: 'SSD_Life_Left',
  241: 'Total_LBAs_Written',
  242: 'Total_LBAs_Read'
}

export function parseAtaVendorBlob(bytes: number[]): SmartAttribute[] {
  const attributes: SmartAttribute[] = []
  // Byte 0-1 la so hieu phien ban, cac ban ghi bat dau tu byte 2
  for (let offset = 2; offset + 11 < bytes.length; offset += 12) {
    const id = bytes[offset]
    if (!id) continue
    // Raw la so nguyen 6 byte little-endian
    let raw = 0
    for (let i = 5; i >= 0; i--) raw = raw * 256 + bytes[offset + 4 + i]
    attributes.push({
      id,
      name: ATA_ATTR_NAME[id] ?? `Attribute_${id}`,
      value: bytes[offset + 3],
      worst: bytes[offset + 4],
      threshold: null,
      raw: String(raw)
    })
  }
  return attributes
}

/** Dung SmartData tu blob WMI. Tra null neu blob khong co thuoc tinh nao dung duoc. */
export function fromWindowsSmartBlob(
  bytes: number[] | null | undefined,
  predictFailure: boolean | null
): SmartData | null {
  if (!bytes || bytes.length < 14) return null
  const attributes = parseAtaVendorBlob(bytes)
  if (!attributes.length) return null
  const data = summarizeAta(attributes, {
    source: 'wmi',
    healthy: predictFailure === null ? null : !predictFailure
  })
  // Nhiet do o mot so o nam o byte thap cua thuoc tinh 194, gia tri phi ly thi bo
  if (data.temperatureC !== null && (data.temperatureC <= 0 || data.temperatureC > 120)) {
    data.temperatureC = data.temperatureC % 256 || null
  }
  return data
}

interface WinReliability {
  DeviceId?: string
  SerialNumber?: string
  Temperature?: number
  PowerOnHours?: number
  Wear?: number
  ReadErrorsTotal?: number
  WriteErrorsTotal?: number
  StartStopCycleCount?: number
  HealthStatus?: string
}

export function fromWindowsReliability(row: WinReliability | null): SmartData {
  if (!row) return emptySmart('Không đọc được chỉ số tin cậy từ Windows Storage API')
  return {
    ...emptySmart(),
    available: true,
    source: 'wmi',
    healthy: row.HealthStatus ? /healthy/i.test(row.HealthStatus) : null,
    powerOnHours: toNum(row.PowerOnHours),
    powerCycles: toNum(row.StartStopCycleCount),
    percentageUsed: toNum(row.Wear),
    temperatureC: toNum(row.Temperature),
    uncorrectableErrors: toNum(row.ReadErrorsTotal),
    error: null
  }
}

/* ---------- Du phong tren macOS ---------- */

export function fromMacSmartStatus(status: unknown): SmartData {
  const text = toStr(status)
  if (!text) return emptySmart('macOS không cung cấp SMART chi tiết nếu thiếu smartctl')
  return {
    ...emptySmart(),
    available: true,
    source: 'macos',
    healthy: /verified|ok/i.test(text),
    error: 'Chỉ có trạng thái tổng quát. Cài smartmontools để xem giờ chạy và TBW.'
  }
}

/**
 * Gop hai nguon SMART: uu tien nguon chinh, lay nguon phu bu vao cho con trong.
 * Tren Windows blob WMI cho bang thuoc tinh ATA, con Storage API cho do mon cua o NVMe.
 */
export function mergeSmart(primary: SmartData | null, secondary: SmartData | null): SmartData | null {
  if (!primary) return secondary
  if (!secondary) return primary
  const merged = { ...primary }
  for (const key of Object.keys(merged) as (keyof SmartData)[]) {
    if (merged[key] === null && secondary[key] !== null) {
      // Gan qua chi so dong kieu: cac truong deu la number|string|boolean|null
      (merged as Record<string, unknown>)[key] = secondary[key]
    }
  }
  if (!merged.attributes.length) merged.attributes = secondary.attributes
  return merged
}
