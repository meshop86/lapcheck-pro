import type { BatteryInfo, DisplayInfo, OwnershipInfo } from '@shared/types'
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
    uuid: toStr(hw.platform_UUID)
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

/* --------------------- Khoa may & quyen so huu --------------------- */

interface MobileMeAccount {
  AccountID?: string
  isManagedAppleID?: boolean
  Services?: { Name?: string; status?: string; Enabled?: boolean }[]
}

/**
 * Tim thu muc home cua nguoi dang dang nhap man hinh.
 * Khi app chay bang sudo thi process.env.HOME tro ve /var/root, khong phai nguoi dung that.
 */
async function consoleUserHome(): Promise<string | null> {
  const res = await run('stat', ['-f', '%Su', '/dev/console'], 5_000)
  const user = toStr(res.stdout).trim()
  if (!user || user === 'root') return process.env.HOME ?? null
  const home = await run('dscl', ['.', '-read', `/Users/${user}`, 'NFSHomeDirectory'], 5_000)
  const m = /NFSHomeDirectory:\s*(\S.*)$/m.exec(home.stdout)
  return m ? m[1].trim() : `/Users/${user}`
}

/** Doc tai khoan iCloud dang dang nhap va trang thai Find My Mac. */
async function readICloud(notes: string[]): Promise<{
  account: string | null
  managed: boolean | null
  findMy: boolean | null
}> {
  const home = await consoleUserHome()
  if (!home) {
    notes.push('Không xác định được người dùng đang đăng nhập nên chưa đọc được tài khoản iCloud.')
    return { account: null, managed: null, findMy: null }
  }
  const plist = `${home}/Library/Preferences/MobileMeAccounts.plist`
  const res = await run('plutil', ['-convert', 'json', '-o', '-', plist], 8_000)
  if (!res.ok) {
    // Khong co file nghia la chua tung dang nhap iCloud tren tai khoan nay
    return { account: null, managed: false, findMy: false }
  }
  const data = parseJson<{ Accounts?: MobileMeAccount[] }>(res.stdout)
  const acc = data?.Accounts?.[0]
  if (!acc) return { account: null, managed: false, findMy: false }
  const findMy = (acc.Services ?? []).some(
    (s) => s.Name === 'FIND_MY_MAC' && s.Enabled !== false && s.status !== 'inactive'
  )
  return {
    account: toStr(acc.AccountID) || null,
    managed: acc.isManagedAppleID ?? null,
    findMy
  }
}

/** Doc trang thai DEP va MDM. Lenh nay chay duoc o quyen thuong. */
async function readEnrollment(notes: string[]): Promise<{
  dep: boolean | null
  mdm: boolean | null
  org: string | null
}> {
  const res = await run('profiles', ['status', '-type', 'enrollment'], 15_000)
  const out = `${res.stdout}\n${res.stderr}`
  const yes = (label: string): boolean | null => {
    const m = new RegExp(`${label}:\\s*(Yes|No)`, 'i').exec(out)
    return m ? /yes/i.test(m[1]) : null
  }
  const dep = yes('Enrolled via DEP')
  const mdm = yes('MDM enrollment')
  if (dep === null && mdm === null) {
    notes.push(`Không đọc được trạng thái MDM/DEP: ${res.error ?? 'lệnh profiles không trả kết quả'}`)
  }

  // Ten to chuc chi lo ra khi chay bang root
  let org: string | null = null
  if (mdm) {
    const detail = await run('profiles', ['show', '-type', 'enrollment'], 15_000)
    const m = /OrganizationName\s*=\s*"?([^";\n]+)"?/i.exec(detail.stdout)
    org = m ? m[1].trim() : null
    if (!org && /root/i.test(detail.stderr)) {
      notes.push('Cần chạy app bằng quyền root để xem tên tổ chức đang quản lý máy.')
    }
  }
  return { dep, mdm, org }
}

/** Dem so configuration profile da cai. Can quyen root. */
async function readProfileCount(notes: string[]): Promise<number | null> {
  const res = await run('profiles', ['list', '-all'], 15_000)
  if (!res.ok) {
    notes.push('Cần quyền root để liệt kê configuration profile đã cài.')
    return null
  }
  const matches = res.stdout.match(/profileIdentifier/g)
  return matches ? matches.length : 0
}

/** Mac Intel: kiem tra firmware password. Apple Silicon khong co khai niem nay. */
async function readFirmwarePassword(): Promise<boolean | null> {
  const res = await run('firmwarepasswd', ['-check'], 8_000)
  if (!res.ok) return null
  const m = /Password Enabled:\s*(Yes|No)/i.exec(res.stdout)
  return m ? /yes/i.test(m[1]) : null
}

export async function readOwnership(): Promise<OwnershipInfo> {
  const notes: string[] = []
  const [enrollment, icloud, hw, firmwarePassword] = await Promise.all([
    readEnrollment(notes),
    readICloud(notes),
    profiler<MacHardware[]>('SPHardwareDataType'),
    readFirmwarePassword()
  ])
  const configProfiles = enrollment.mdm ? await readProfileCount(notes) : null
  const lockStatus = hw?.[0]?.activation_lock_status

  if (!lockStatus) {
    notes.push(
      'Máy không báo cáo Activation Lock (thường gặp ở Mac Intel đời trước 2018, không có chip T2).'
    )
  }

  return {
    depEnrolled: enrollment.dep,
    mdmEnrolled: enrollment.mdm,
    mdmOrganization: enrollment.org,
    configProfiles,
    activationLocked: lockStatus ? /enabled/i.test(lockStatus) : null,
    icloudAccount: icloud.account,
    managedAppleId: icloud.managed,
    findMyEnabled: icloud.findMy,
    firmwarePassword,
    notes
  }
}
