import type { BatteryInfo, DisplayInfo } from '@shared/types'
import { parseJson, round, run, toNum, toSerial, toStr } from '../util'

/* ------------------------- system_profiler ------------------------- */

async function profiler<T>(dataType: string, timeoutMs = 20_000): Promise<T | null> {
  const res = await run('system_profiler', [dataType, '-json'], timeoutMs)
  if (!res.ok) return null
  const parsed = parseJson<Record<string, T>>(res.stdout)
  return parsed?.[dataType] ?? null
}

interface MacHardware {
  machine_model?: string
  machine_name?: string
  model_number?: string
  chip_type?: string
  serial_number?: string
  boot_rom_version?: string
  physical_memory?: string
  platform_UUID?: string
  activation_lock_status?: string
}

export interface MacMachineExtras {
  modelIdentifier: string
  modelNumber: string
  chip: string
  bootRom: string
  serial: string
  uuid: string
  activationLocked: boolean | null
}

export async function readMachineExtras(): Promise<MacMachineExtras | null> {
  const items = await profiler<MacHardware[]>('SPHardwareDataType')
  const hw = items?.[0]
  if (!hw) return null
  return {
    modelIdentifier: toStr(hw.machine_model),
    modelNumber: toStr(hw.model_number),
    chip: toStr(hw.chip_type),
    bootRom: toStr(hw.boot_rom_version),
    serial: toStr(hw.serial_number),
    uuid: toStr(hw.platform_UUID),
    activationLocked: hw.activation_lock_status
      ? /enabled/i.test(hw.activation_lock_status)
      : null
  }
}

/* ---------------------------- Man hinh ----------------------------- */

interface MacDisplayNode {
  _name?: string
  '_spdisplays_display-product-id'?: string
  '_spdisplays_display-vendor-id'?: string
  '_spdisplays_display-serial-number'?: string
  '_spdisplays_display-week'?: string
  '_spdisplays_display-year'?: string
  _spdisplays_pixels?: string
  _spdisplays_resolution?: string
  spdisplays_resolution?: string
  spdisplays_display_type?: string
  spdisplays_connection_type?: string
  spdisplays_main?: string
}

interface MacGpuNode {
  spdisplays_ndrvs?: MacDisplayNode[]
  sppci_model?: string
}

/** "1920 x 1080 @ 75.00Hz" -> { x, y, hz } */
function parseResolution(text: string): { x: number | null; y: number | null; hz: number | null } {
  const m = /(\d+)\s*x\s*(\d+)(?:.*?@\s*([\d.]+)\s*Hz)?/i.exec(text)
  if (!m) return { x: null, y: null, hz: null }
  return { x: toNum(m[1]), y: toNum(m[2]), hz: m[3] ? round(toNum(m[3]), 0) : null }
}

export async function readDisplays(): Promise<DisplayInfo[]> {
  const gpus = await profiler<MacGpuNode[]>('SPDisplaysDataType')
  if (!gpus) return []
  const out: DisplayInfo[] = []
  let index = 0
  for (const gpu of gpus) {
    for (const node of gpu.spdisplays_ndrvs ?? []) {
      const res = parseResolution(
        toStr(node.spdisplays_resolution ?? node._spdisplays_resolution)
      )
      const native = parseResolution(toStr(node._spdisplays_pixels))
      const connection = toStr(node.spdisplays_connection_type).replace('spdisplays_', '')
      out.push({
        index: index++,
        builtin: /internal|builtin/i.test(
          `${connection} ${toStr(node.spdisplays_display_type)}`
        ),
        vendorId: toStr(node['_spdisplays_display-vendor-id']) || null,
        vendorName: null,
        model: toStr(node._name) || null,
        serialNumber: toSerial(node['_spdisplays_display-serial-number']),
        currentResX: res.x,
        currentResY: res.y,
        nativeResX: native.x ?? res.x,
        nativeResY: native.y ?? res.y,
        refreshRateHz: res.hz,
        pixelDepth: null,
        sizeInches: null,
        physicalWidthMm: null,
        physicalHeightMm: null,
        manufactureWeek: toNum(node['_spdisplays_display-week']),
        manufactureYear: toNum(node['_spdisplays_display-year']),
        connection: connection || null
      })
    }
  }
  return out
}

/* ------------------------------ Pin -------------------------------- */

/** Doc cac cap "Key" = value tu ioreg. */
function parseIoreg(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /"([A-Za-z0-9_]+)"\s*=\s*(Yes|No|true|false|-?\d+|"[^"]*")/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!(m[1] in map)) map[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return map
}

interface MacPowerNode {
  _name?: string
  sppower_battery_health_info?: {
    sppower_battery_health?: string
    sppower_battery_cycle_count?: number
    sppower_battery_health_maximum_capacity?: string
  }
  sppower_battery_charge_info?: {
    sppower_battery_state_of_charge?: number
    sppower_battery_is_charging?: string
    sppower_battery_fully_charged?: string
  }
  sppower_battery_model_info?: {
    sppower_battery_serial_number?: string
    sppower_battery_manufacturer?: string
    sppower_battery_device_name?: string
  }
}

export async function readBattery(): Promise<Partial<BatteryInfo> | null> {
  const res = await run('ioreg', ['-rn', 'AppleSmartBattery', '-w0'], 10_000)
  const power = await profiler<MacPowerNode[]>('SPPowerDataType', 15_000)
  const health = power?.find((p) => p.sppower_battery_health_info)?.sppower_battery_health_info
  const charge = power?.find((p) => p.sppower_battery_charge_info)?.sppower_battery_charge_info
  const model = power?.find((p) => p.sppower_battery_model_info)?.sppower_battery_model_info

  if (!res.ok || !res.stdout.trim()) {
    // May ban khong co pin (Mac mini / iMac)
    if (!health) return { hasBattery: false }
  }

  const io = parseIoreg(res.stdout)
  const voltageMv = toNum(io.Voltage)
  const designMah = toNum(io.DesignCapacity)
  const nominalMah = toNum(io.NominalChargeCapacity ?? io.AppleRawMaxCapacity ?? io.MaxCapacity)
  const currentMah = toNum(io.AppleRawCurrentCapacity ?? io.CurrentCapacity)
  const mwh = (mah: number | null): number | null =>
    mah !== null && voltageMv !== null ? Math.round((mah * voltageMv) / 1000) : null

  // Apple bao % suc khoe trong System Settings -> uu tien con so nay cho khop voi khach hang
  const appleHealth = toNum(health?.sppower_battery_health_maximum_capacity)
  const computedHealth =
    designMah && nominalMah ? round((nominalMah / designMah) * 100, 1) : null
  const healthPercent = appleHealth ?? computedHealth

  const amperage = toNum(io.Amperage)
  const isCharging = /yes|true/i.test(
    toStr(charge?.sppower_battery_is_charging ?? io.IsCharging)
  )

  return {
    hasBattery: true,
    manufacturer: toStr(model?.sppower_battery_manufacturer ?? io.Manufacturer),
    model: toStr(model?.sppower_battery_device_name ?? io.DeviceName),
    serial: toStr(model?.sppower_battery_serial_number ?? io.BatterySerialNumber),
    chemistry: 'Li-ion',
    designedCapacityMWh: mwh(designMah),
    maxCapacityMWh: mwh(nominalMah),
    currentCapacityMWh: mwh(currentMah),
    healthPercent,
    wearPercent: healthPercent !== null ? round(100 - healthPercent, 1) : null,
    cycleCount: toNum(health?.sppower_battery_cycle_count ?? io.CycleCount),
    designCycleCount: toNum(io.DesignCycleCount9C ?? io.DesignCycleCount),
    voltageV: voltageMv !== null ? round(voltageMv / 1000, 2) : null,
    powerW:
      amperage !== null && voltageMv !== null
        ? round((amperage * voltageMv) / 1_000_000, 2)
        : null,
    percent: toNum(charge?.sppower_battery_state_of_charge ?? io.CurrentCapacity),
    isCharging,
    condition: toStr(health?.sppower_battery_health) || null
  }
}

/* ----------------------------- Wi-Fi ------------------------------- */

interface MacAirportNode {
  spairport_airport_interfaces?: {
    _name?: string
    spairport_supported_phymodes?: string
    spairport_supported_channels?: string[]
  }[]
}

/** Tra ve map: ten interface -> danh sach chuan Wi-Fi ho tro. */
export async function readWifiStandards(): Promise<Record<string, string[]>> {
  const data = await profiler<MacAirportNode[]>('SPAirPortDataType', 20_000)
  const out: Record<string, string[]> = {}
  for (const node of data ?? []) {
    for (const iface of node.spairport_airport_interfaces ?? []) {
      const name = toStr(iface._name)
      const modes = toStr(iface.spairport_supported_phymodes)
      if (name && modes) out[name] = expandPhyModes(modes)
    }
  }
  return out
}

const WIFI_LABELS: Record<string, string> = {
  a: '802.11a',
  b: '802.11b',
  g: '802.11g',
  n: '802.11n (Wi-Fi 4)',
  ac: '802.11ac (Wi-Fi 5)',
  ax: '802.11ax (Wi-Fi 6/6E)',
  be: '802.11be (Wi-Fi 7)'
}

/** "802.11 a/b/g/n/ac/ax" -> ['802.11a', ..., '802.11ax (Wi-Fi 6/6E)'] */
export function expandPhyModes(modes: string): string[] {
  const tail = modes.replace(/^802\.11\s*/i, '')
  return tail
    .split('/')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean)
    .map((m) => WIFI_LABELS[m] ?? `802.11${m}`)
}

/* ---------------------------- O cung ------------------------------- */

export interface MacThermal {
  cpuTempC: number | null
  gpuTempC: number | null
  powerW: number | null
  thermalPressure: string | null
}

let powermetricsUnavailable = false
let thermalCache: { value: MacThermal; at: number } | null = null
const THERMAL_TTL_MS = 3000

/**
 * powermetrics can quyen root. Tra ve dien nang va muc ap luc nhiet;
 * chi may Intel moi in duoc nhiet do die nen cac truong nhiet co the null.
 */
export async function readThermal(): Promise<MacThermal> {
  const empty: MacThermal = { cpuTempC: null, gpuTempC: null, powerW: null, thermalPressure: null }
  if (powermetricsUnavailable) return empty
  if (thermalCache && Date.now() - thermalCache.at < THERMAL_TTL_MS) return thermalCache.value

  const res = await run(
    'powermetrics',
    ['--samplers', 'cpu_power,thermal', '-i', '200', '-n', '1'],
    12_000
  )
  const text = `${res.stdout}\n${res.stderr}`
  if (/must be invoked as the superuser|unrecognized sampler/i.test(text)) {
    // Khong co quyen (hoac ban macOS khong ho tro) -> khong goi lai nua
    powermetricsUnavailable = true
    return empty
  }

  const numberAfter = (pattern: RegExp): number | null => toNum(pattern.exec(text)?.[1])
  const combinedMW = numberAfter(/Combined Power \(CPU \+ GPU[^)]*\):\s*([\d.]+)\s*mW/i)
  const cpuMW = numberAfter(/CPU Power:\s*([\d.]+)\s*mW/i)
  const value: MacThermal = {
    cpuTempC: numberAfter(/CPU die temperature:\s*([\d.]+)/i),
    gpuTempC: numberAfter(/GPU die temperature:\s*([\d.]+)/i),
    powerW: round((combinedMW ?? cpuMW ?? 0) / 1000, 2) || null,
    thermalPressure: toStr(/pressure level:\s*(\w+)/i.exec(text)?.[1]) || null
  }
  thermalCache = { value, at: Date.now() }
  return value
}

export interface MacHardwarePort {
  /** Ten cong theo macOS: "Wi-Fi", "Ethernet", "Thunderbolt 1"... */
  name: string
  /** MAC that gan tren phan cung (khac MAC ngau nhien cua Wi-Fi rieng tu) */
  mac: string
}

/**
 * networksetup liet ke dung nhung cong mang vat ly, kem ten hien thi va MAC that.
 * Dung lam danh sach trang de loai bo anpi/awdl/llw/utun... cua macOS.
 */
export async function readHardwarePorts(): Promise<Record<string, MacHardwarePort>> {
  const res = await run('networksetup', ['-listallhardwareports'], 10_000)
  if (!res.ok) return {}

  const ports: Record<string, MacHardwarePort> = {}
  let name = ''
  let device = ''
  for (const line of res.stdout.split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key === 'hardware port') {
      name = value
      device = ''
    } else if (key === 'device') {
      device = value
    } else if (key === 'ethernet address' && device) {
      const mac = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(value) ? value.toLowerCase() : ''
      ports[device] = { name: name || device, mac }
      device = ''
    }
  }
  return ports
}

interface MacNvmeItem {
  _name?: string
  bsd_name?: string
  device_model?: string
  device_serial?: string
  device_revision?: string
  size_in_bytes?: number
  smart_status?: string
  removable_media?: string
}

export async function readNvmeSmartStatus(): Promise<Record<string, string>> {
  const groups = await profiler<{ _items?: MacNvmeItem[] }[]>('SPNVMeDataType', 20_000)
  const out: Record<string, string> = {}
  for (const g of groups ?? []) {
    for (const item of g._items ?? []) {
      const key = toStr(item.bsd_name)
      if (key) out[key] = toStr(item.smart_status)
    }
  }
  return out
}
