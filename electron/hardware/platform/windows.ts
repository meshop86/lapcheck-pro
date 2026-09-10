import type { BatteryInfo, DisplayInfo, SmartData } from '@shared/types'
import { fromWindowsReliability, fromWindowsSmartBlob } from '../smart'
import { powershellJson, round, run, toNum, toSerial, toStr } from '../util'

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/* --------------------- May, BIOS, TPM, ban quyen -------------------- */

export interface WinMachineExtras {
  secureBoot: boolean | null
  tpmVersion: string | null
  tpmEnabled: boolean | null
  licenseChannel: string | null
  licenseActivated: boolean | null
  chassisType: string | null
  systemSku: string | null
}

/** Ma loai vo may theo chuan SMBIOS (Win32_SystemEnclosure.ChassisTypes). */
const CHASSIS_TYPES: Record<number, string> = {
  8: 'Portable',
  9: 'Laptop',
  10: 'Notebook',
  11: 'Hand Held',
  12: 'Docking Station',
  14: 'Sub Notebook',
  30: 'Tablet',
  31: 'Convertible',
  32: 'Detachable',
  3: 'Desktop',
  4: 'Low Profile Desktop',
  6: 'Mini Tower',
  7: 'Tower',
  23: 'Rack Mount Chassis'
}

const LICENSE_SCRIPT = `
$out = [ordered]@{}
try {
  $sb = Confirm-SecureBootUEFI
  $out.secureBoot = [bool]$sb
} catch { $out.secureBoot = $null }
try {
  $t = Get-Tpm
  $out.tpmEnabled = [bool]$t.TpmEnabled
  $v = Get-CimInstance -Namespace root\\cimv2\\security\\microsofttpm -ClassName Win32_Tpm -ErrorAction SilentlyContinue
  $out.tpmVersion = if ($v) { ($v.SpecVersion -split ',')[0].Trim() } else { $null }
} catch { $out.tpmEnabled = $null; $out.tpmVersion = $null }
try {
  $lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationId='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" |
    Select-Object -First 1
  $out.licenseChannel = $lic.ProductKeyChannel
  $out.licenseActivated = ($lic.LicenseStatus -eq 1)
} catch { $out.licenseChannel = $null; $out.licenseActivated = $null }
try {
  $enc = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
  $out.chassisCode = @($enc.ChassisTypes)[0]
} catch { $out.chassisCode = $null }
try {
  $cs = Get-CimInstance Win32_ComputerSystem
  $out.systemSku = $cs.SystemSKUNumber
} catch { $out.systemSku = $null }
$out | ConvertTo-Json -Depth 3 -Compress
`

export async function readMachineExtras(): Promise<WinMachineExtras | null> {
  const raw = await powershellJson<{
    secureBoot: boolean | null
    tpmEnabled: boolean | null
    tpmVersion: string | null
    licenseChannel: string | null
    licenseActivated: boolean | null
    chassisCode: number | null
    systemSku: string | null
  }>(LICENSE_SCRIPT, 30_000)
  if (!raw) return null
  return {
    secureBoot: raw.secureBoot,
    tpmEnabled: raw.tpmEnabled,
    tpmVersion: toStr(raw.tpmVersion) || null,
    licenseChannel: toStr(raw.licenseChannel) || null,
    licenseActivated: raw.licenseActivated,
    chassisType: raw.chassisCode ? (CHASSIS_TYPES[raw.chassisCode] ?? `Type ${raw.chassisCode}`) : null,
    systemSku: toStr(raw.systemSku) || null
  }
}

/* ------------------------------- Pin -------------------------------- */

const BATTERY_SCRIPT = `
$out = [ordered]@{}
$ns = 'root\\wmi'
try { $out.static = Get-CimInstance -Namespace $ns -ClassName BatteryStaticData -ErrorAction Stop |
  Select-Object DesignedCapacity, DeviceName, ManufactureName, SerialNumber, Chemistry, DefaultAlert1, CycleCount } catch { $out.static = $null }
try { $out.full = (Get-CimInstance -Namespace $ns -ClassName BatteryFullChargedCapacity -ErrorAction Stop |
  Select-Object -First 1).FullChargedCapacity } catch { $out.full = $null }
try { $out.cycles = (Get-CimInstance -Namespace $ns -ClassName BatteryCycleCount -ErrorAction Stop |
  Select-Object -First 1).CycleCount } catch { $out.cycles = $null }
try { $out.status = Get-CimInstance -Namespace $ns -ClassName BatteryStatus -ErrorAction Stop |
  Select-Object -First 1 -Property RemainingCapacity, Voltage, ChargeRate, DischargeRate, Charging, PowerOnline } catch { $out.status = $null }
try { $out.w32 = Get-CimInstance Win32_Battery -ErrorAction Stop |
  Select-Object -First 1 -Property EstimatedChargeRemaining, EstimatedRunTime, BatteryStatus, DesignVoltage, Name } catch { $out.w32 = $null }
$out | ConvertTo-Json -Depth 4 -Compress
`

interface WinBatteryRaw {
  static: {
    DesignedCapacity?: number
    DeviceName?: string
    ManufactureName?: string
    SerialNumber?: string
    Chemistry?: string
    CycleCount?: number
  } | null
  full: number | null
  cycles: number | null
  status: {
    RemainingCapacity?: number
    Voltage?: number
    ChargeRate?: number
    DischargeRate?: number
    Charging?: boolean
    PowerOnline?: boolean
  } | null
  w32: {
    EstimatedChargeRemaining?: number
    EstimatedRunTime?: number
    DesignVoltage?: number
    Name?: string
  } | null
}

export async function readBattery(): Promise<Partial<BatteryInfo> | null> {
  const raw = await powershellJson<WinBatteryRaw>(BATTERY_SCRIPT, 30_000)
  if (!raw) return null
  const st = asArray(raw.static)[0] ?? null
  if (!st && !raw.full && !raw.w32) return { hasBattery: false }

  // Cac lop root\wmi tra dung vi mWh -> khong can quy doi
  const designed = toNum(st?.DesignedCapacity)
  const full = toNum(raw.full)
  const remaining = toNum(raw.status?.RemainingCapacity)
  const healthPercent = designed && full ? round((full / designed) * 100, 1) : null
  const voltageMv = toNum(raw.status?.Voltage ?? raw.w32?.DesignVoltage)
  const chargeRate = toNum(raw.status?.ChargeRate) ?? 0
  const dischargeRate = toNum(raw.status?.DischargeRate) ?? 0
  const netMw = chargeRate - dischargeRate
  const runtime = toNum(raw.w32?.EstimatedRunTime)

  return {
    hasBattery: true,
    manufacturer: toStr(st?.ManufactureName),
    model: toStr(st?.DeviceName ?? raw.w32?.Name),
    serial: toStr(st?.SerialNumber),
    chemistry: toStr(st?.Chemistry, 'Li-ion'),
    designedCapacityMWh: designed,
    maxCapacityMWh: full,
    currentCapacityMWh: remaining,
    healthPercent,
    wearPercent: healthPercent !== null ? round(100 - healthPercent, 1) : null,
    cycleCount: toNum(raw.cycles ?? st?.CycleCount),
    voltageV: voltageMv !== null ? round(voltageMv / 1000, 2) : null,
    powerW: netMw !== 0 ? round(netMw / 1000, 2) : null,
    percent: toNum(raw.w32?.EstimatedChargeRemaining),
    isCharging: Boolean(raw.status?.Charging),
    acConnected: Boolean(raw.status?.PowerOnline),
    // Windows tra 71582788 khi khong xac dinh duoc
    timeRemainingMin: runtime !== null && runtime > 0 && runtime < 10_000 ? runtime : null
  }
}

/* ----------------------------- Man hinh ----------------------------- */

const MONITOR_SCRIPT = `
function Convert-Chars($arr) {
  if (-not $arr) { return '' }
  -join ($arr | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ })
}
$ids = Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue
$params = Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue
$conn = Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorConnectionParams -ErrorAction SilentlyContinue
$list = @()
foreach ($id in $ids) {
  $p = $params | Where-Object { $_.InstanceName -eq $id.InstanceName } | Select-Object -First 1
  $c = $conn   | Where-Object { $_.InstanceName -eq $id.InstanceName } | Select-Object -First 1
  $list += [ordered]@{
    instance = $id.InstanceName
    vendor   = Convert-Chars $id.ManufacturerName
    name     = Convert-Chars $id.UserFriendlyName
    serial   = Convert-Chars $id.SerialNumberID
    product  = Convert-Chars $id.ProductCodeID
    year     = $id.YearOfManufacture
    week     = $id.WeekOfManufacture
    widthCm  = $p.MaxHorizontalImageSize
    heightCm = $p.MaxVerticalImageSize
    videoOut = $c.VideoOutputTechnology
  }
}
@($list) | ConvertTo-Json -Depth 3 -Compress
`

interface WinMonitorRaw {
  instance?: string
  vendor?: string
  name?: string
  serial?: string
  product?: string
  year?: number
  week?: number
  widthCm?: number
  heightCm?: number
  videoOut?: number
}

/** Ma cong xuat hinh theo D3DKMDT_VIDEO_OUTPUT_TECHNOLOGY. */
const VIDEO_OUTPUT: Record<number, string> = {
  0: 'VGA',
  4: 'DVI',
  5: 'HDMI',
  10: 'DisplayPort',
  11: 'Internal (eDP/LVDS)',
  [-2 >>> 0]: 'Internal'
}

export async function readDisplays(): Promise<DisplayInfo[]> {
  const raw = await powershellJson<WinMonitorRaw | WinMonitorRaw[]>(MONITOR_SCRIPT, 25_000)
  const rows = asArray(raw)
  return rows.map((r, index) => {
    const widthMm = toNum(r.widthCm) !== null ? (r.widthCm as number) * 10 : null
    const heightMm = toNum(r.heightCm) !== null ? (r.heightCm as number) * 10 : null
    const diagonal =
      widthMm && heightMm ? round(Math.hypot(widthMm, heightMm) / 25.4, 1) : null
    const videoOut = toNum(r.videoOut)
    const connection = videoOut !== null ? (VIDEO_OUTPUT[videoOut] ?? `Code ${videoOut}`) : null
    return {
      index,
      builtin: /internal/i.test(connection ?? ''),
      vendorId: toStr(r.vendor) || null,
      vendorName: toStr(r.vendor) || null,
      model: toStr(r.name) || toStr(r.product) || null,
      serialNumber: toSerial(r.serial),
      currentResX: null,
      currentResY: null,
      nativeResX: null,
      nativeResY: null,
      refreshRateHz: null,
      pixelDepth: null,
      sizeInches: diagonal,
      physicalWidthMm: widthMm,
      physicalHeightMm: heightMm,
      manufactureWeek: toNum(r.week),
      manufactureYear: toNum(r.year),
      connection
    }
  })
}

/* ------------------------- SMART du phong --------------------------- */

const RELIABILITY_SCRIPT = `
$list = @()
foreach ($d in Get-PhysicalDisk) {
  $c = $null
  try { $c = $d | Get-StorageReliabilityCounter -ErrorAction Stop } catch {}
  $list += [ordered]@{
    DeviceId = $d.DeviceId
    SerialNumber = $d.SerialNumber
    HealthStatus = $d.HealthStatus
    MediaType = $d.MediaType
    BusType = $d.BusType
    FirmwareVersion = $d.FirmwareVersion
    Temperature = $c.Temperature
    PowerOnHours = $c.PowerOnHours
    Wear = $c.Wear
    ReadErrorsTotal = $c.ReadErrorsTotal
    ReadErrorsUncorrected = $c.ReadErrorsUncorrected
    WriteErrorsTotal = $c.WriteErrorsTotal
    WriteErrorsUncorrected = $c.WriteErrorsUncorrected
    StartStopCycleCount = $c.StartStopCycleCount
  }
}
@($list) | ConvertTo-Json -Depth 3 -Compress
`

/** Tra ve map: serial o cung (chu thuong) -> SMART rut gon tu Windows Storage API. */
export async function readReliabilityCounters(): Promise<Record<string, SmartData>> {
  const rows = asArray(
    await powershellJson<Record<string, unknown> | Record<string, unknown>[]>(
      RELIABILITY_SCRIPT,
      30_000
    )
  )
  const map: Record<string, SmartData> = {}
  for (const row of rows) {
    const serial = toStr(row.SerialNumber).toLowerCase()
    const key = serial || `deviceid:${toStr(row.DeviceId)}`
    map[key] = fromWindowsReliability(row)
  }
  return map
}

const SMART_BLOB_SCRIPT = `
$status = @{}
try {
  Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction Stop |
    ForEach-Object { $status[$_.InstanceName] = [bool]$_.PredictFailure }
} catch {}
$list = @()
try {
  Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictData -ErrorAction Stop |
    ForEach-Object {
      $list += [ordered]@{
        InstanceName = $_.InstanceName
        PredictFailure = $status[$_.InstanceName]
        VendorSpecific = $_.VendorSpecific
      }
    }
} catch {}
@($list) | ConvertTo-Json -Depth 3 -Compress
`

interface SmartBlobRow {
  InstanceName?: string
  PredictFailure?: boolean | null
  VendorSpecific?: number[]
}

/**
 * Doc bang thuoc tinh SMART day du qua WMI, khong can cai smartmontools.
 * Chi o ATA/SATA moi co; o NVMe thi Windows khong cong bo bang nay.
 * Key tra ve la so thu tu o dia lay tu duoi InstanceName (vi du "...\\5&1a2b&0&000000_0" -> 0).
 */
export async function readSmartBlobs(): Promise<Record<number, SmartData>> {
  const rows = asArray(await powershellJson<SmartBlobRow | SmartBlobRow[]>(SMART_BLOB_SCRIPT, 30_000))
  const map: Record<number, SmartData> = {}
  rows.forEach((row, fallbackIndex) => {
    const m = /_(\d+)\s*$/.exec(toStr(row.InstanceName))
    const index = m ? Number(m[1]) : fallbackIndex
    const data = fromWindowsSmartBlob(row.VendorSpecific, row.PredictFailure ?? null)
    if (data) map[index] = data
  })
  return map
}

/* ------------------------------ Wi-Fi ------------------------------- */

/** Doc chuan Wi-Fi ho tro tu `netsh wlan show drivers`. */
export async function readWifiStandards(): Promise<string[]> {
  const res = await run('netsh', ['wlan', 'show', 'drivers'], 15_000)
  if (!res.ok) return []
  // Ho tro ca ban tieng Anh lan cac ban Windows da ngon ngu
  const line = res.stdout
    .split(/\r?\n/)
    .find((l) => /radio types|802\.11/i.test(l) && l.includes(':'))
  if (!line) return []
  const value = line.split(':').slice(1).join(':')
  const modes = value.match(/802\.11\s?[a-z]+/gi) ?? []
  const labels: Record<string, string> = {
    '802.11b': '802.11b',
    '802.11a': '802.11a',
    '802.11g': '802.11g',
    '802.11n': '802.11n (Wi-Fi 4)',
    '802.11ac': '802.11ac (Wi-Fi 5)',
    '802.11ax': '802.11ax (Wi-Fi 6/6E)',
    '802.11be': '802.11be (Wi-Fi 7)'
  }
  return [...new Set(modes.map((m) => m.replace(/\s/g, '').toLowerCase()))].map(
    (m) => labels[m] ?? m
  )
}

/* --------------------- Nhiet do & quat (WMI) ------------------------ */

const THERMAL_SCRIPT = `
$out = [ordered]@{ zones = @(); lhm = @() }
try {
  $out.zones = @(Get-CimInstance -Namespace root\\wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop |
    ForEach-Object { [math]::Round(($_.CurrentTemperature / 10) - 273.15, 1) })
} catch {}
try {
  $out.lhm = @(Get-CimInstance -Namespace root\\LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop |
    Where-Object { $_.SensorType -in @('Temperature','Fan','Power','Clock') } |
    Select-Object Name, SensorType, Value, Identifier)
} catch {}
$out | ConvertTo-Json -Depth 4 -Compress
`

export interface WinThermal {
  zones: number[]
  lhm: { Name: string; SensorType: string; Value: number; Identifier: string }[]
}

/**
 * Nhiet do va quat tren Windows.
 * MSAcpi_ThermalZoneTemperature thuong bi hang laptop tat -> khi do doc qua
 * WMI provider cua LibreHardwareMonitor (neu ky thuat vien dang chay LHM).
 */
export async function readThermal(): Promise<WinThermal> {
  const raw = await powershellJson<WinThermal>(THERMAL_SCRIPT, 20_000)
  return { zones: asArray(raw?.zones), lhm: asArray(raw?.lhm) }
}
