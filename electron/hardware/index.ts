import os from 'node:os'
import si from 'systeminformation'
import type {
  AudioDeviceInfo,
  SmartData,
  BatteryInfo,
  CpuInfo,
  DisplayInfo,
  GraphicsController,
  MachineInfo,
  MemoryInfo,
  NetworkAdapter,
  Platform,
  StorageDevice,
  StoragePartition,
  SystemProfile
} from '@shared/types'
import { emptySmart, fromMacSmartStatus, readSmartctl } from './smart'
import { round, run, toNum, toStr } from './util'
import * as mac from './platform/darwin'
import * as win from './platform/windows'

const platform = os.platform() as Platform
const isWin = platform === 'win32'
const isMac = platform === 'darwin'

/* ------------------------------------------------------------------ */
/* Quyen quan tri                                                      */
/* ------------------------------------------------------------------ */

let privilegedCache: boolean | null = null

export async function isPrivileged(): Promise<boolean> {
  if (privilegedCache !== null) return privilegedCache
  if (isWin) {
    const res = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
      ],
      10_000
    )
    privilegedCache = /true/i.test(res.stdout)
  } else {
    privilegedCache = typeof process.getuid === 'function' && process.getuid() === 0
  }
  return privilegedCache
}

/* ------------------------------------------------------------------ */
/* May & he dieu hanh                                                  */
/* ------------------------------------------------------------------ */

async function collectMachine(warnings: string[]): Promise<MachineInfo> {
  const [system, bios, osInfo, chassis] = await Promise.all([
    si.system(),
    si.bios(),
    si.osInfo(),
    si.chassis()
  ])

  const base: MachineInfo = {
    manufacturer: toStr(system.manufacturer),
    model: toStr(system.model),
    sku: toStr(system.sku),
    version: toStr(system.version),
    serial: toStr(system.serial),
    uuid: toStr(system.uuid),
    chassisType: toStr(chassis.type),
    biosVendor: toStr(bios.vendor),
    biosVersion: toStr(bios.version),
    biosReleaseDate: toStr(bios.releaseDate),
    osDistro: toStr(osInfo.distro),
    osRelease: toStr(osInfo.release),
    osBuild: toStr(osInfo.build),
    osArch: toStr(osInfo.arch),
    hostname: toStr(osInfo.hostname),
    licenseChannel: null,
    licenseActivated: null,
    secureBoot: null,
    tpmVersion: null,
    estimatedManufactureDate: null
  }

  if (isWin) {
    const extras = await win.readMachineExtras()
    if (extras) {
      base.secureBoot = extras.secureBoot
      base.tpmVersion = extras.tpmVersion
      base.licenseChannel = extras.licenseChannel
      base.licenseActivated = extras.licenseActivated
      base.chassisType = extras.chassisType ?? base.chassisType
      base.sku = base.sku || (extras.systemSku ?? '')
    } else {
      warnings.push('Không đọc được TPM / Secure Boot / bản quyền Windows (cần quyền Administrator).')
    }
  }

  if (isMac) {
    const extras = await mac.readMachineExtras()
    if (extras) {
      base.model = base.model || extras.modelIdentifier
      base.sku = base.sku || extras.modelNumber
      base.serial = base.serial || extras.serial
      base.uuid = base.uuid || extras.uuid
      base.biosVersion = base.biosVersion || extras.bootRom
      base.version = extras.chip || base.version
      base.tpmVersion = 'Apple Secure Enclave'
    }
  }

  // BIOS cang cu so voi doi may cang de la may chua bao gio duoc cap nhat
  if (base.biosReleaseDate) base.estimatedManufactureDate = base.biosReleaseDate

  return base
}

/* ------------------------------------------------------------------ */
/* CPU                                                                 */
/* ------------------------------------------------------------------ */

async function collectCpu(): Promise<CpuInfo> {
  const cpu = await si.cpu()
  return {
    manufacturer: toStr(cpu.manufacturer),
    brand: toStr(cpu.brand),
    family: toStr(cpu.family),
    model: toStr(cpu.model),
    stepping: toStr(cpu.stepping),
    socket: toStr(cpu.socket),
    physicalCores: cpu.physicalCores ?? 0,
    logicalCores: cpu.cores ?? 0,
    performanceCores: cpu.performanceCores ?? null,
    efficiencyCores: cpu.efficiencyCores ?? null,
    baseSpeedGHz: toNum(cpu.speed),
    maxSpeedGHz: toNum(cpu.speedMax) ?? toNum(cpu.speed),
    cacheL1dBytes: toNum(cpu.cache?.l1d),
    cacheL2Bytes: toNum(cpu.cache?.l2),
    cacheL3Bytes: toNum(cpu.cache?.l3),
    virtualizationEnabled: cpu.virtualization ?? null
  }
}

/* ------------------------------------------------------------------ */
/* RAM                                                                 */
/* ------------------------------------------------------------------ */

async function collectMemory(): Promise<MemoryInfo> {
  const [mem, layout] = await Promise.all([si.mem(), si.memLayout()])
  const modules = layout
    .filter((m) => (m.size ?? 0) > 0)
    .map((m) => ({
      slot: toStr(m.bank) || toStr((m as { slot?: string }).slot),
      bank: toStr(m.bank),
      sizeBytes: m.size ?? 0,
      type: toStr(m.type),
      clockSpeedMHz: toNum(m.clockSpeed),
      configuredClockMHz: toNum((m as { configuredClockSpeed?: number }).configuredClockSpeed),
      manufacturer: toStr(m.manufacturer),
      partNumber: toStr(m.partNum),
      serialNumber: toStr(m.serialNum),
      voltage: toNum(m.voltageConfigured),
      formFactor: toStr(m.formFactor),
      ecc: m.ecc ?? null
    }))
  return {
    totalBytes: mem.total,
    freeBytes: mem.available,
    usedBytes: mem.total - mem.available,
    swapTotalBytes: mem.swaptotal,
    slotsTotal: layout.length || null,
    slotsUsed: modules.length,
    modules
  }
}

/* ------------------------------------------------------------------ */
/* O cung + SMART                                                      */
/* ------------------------------------------------------------------ */

function smartctlDevicePath(index: number, siDevice: string): string {
  if (isWin) return `\\\\.\\PhysicalDrive${index}`
  // macOS: si tra ve dinh danh dang "disk5"; khong duoc suy tu chi so vi disk1..3
  // la cac container APFS ao chu khong phai o vat ly thu hai
  if (isMac) return /^disk\d+$/.test(siDevice) ? `/dev/${siDevice}` : `/dev/disk${index}`
  if (!siDevice) return `/dev/sd${String.fromCharCode(97 + index)}`
  return siDevice.startsWith('/dev/') ? siDevice : `/dev/${siDevice}`
}

/** So sanh duong dan thiet bi bo qua hoa thuong va dau ngan cach ("\\\\.\\PHYSICALDRIVE0"). */
function sameDevice(a: string, b: string): boolean {
  const normalize = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, '')
  return Boolean(a) && normalize(a) === normalize(b)
}

/** "/dev/disk5s1" -> "disk5", "C:" -> "c" */
function diskBaseName(value: string): string {
  const tail = value.replace(/^\/dev\//, '').toLowerCase()
  return (/^(disk\d+|sd[a-z]+|nvme\d+n\d+|hd[a-z])/.exec(tail)?.[1] ?? tail).replace(/[^a-z0-9]/g, '')
}

/**
 * Ghep phan vung vao dung o vat ly. blockDevices cho biet moi filesystem nam
 * tren o nao; neu thieu thong tin thi doi chieu theo ten thiet bi.
 */
function partitionsOfDevice(
  devicePath: string,
  fsSizes: si.Systeminformation.FsSizeData[],
  ownerByFs: Map<string, string>,
  onlyDisk: boolean
): StoragePartition[] {
  return fsSizes
    .filter((f) => {
      const fsName = toStr(f.fs)
      if (!isWin && !fsName.startsWith('/dev/')) return false
      // An cac volume he thong cua macOS, chi giu volume nguoi dung nhin thay
      if (/^\/System\/Volumes\/(?!Data$)/.test(toStr(f.mount))) return false
      const owner = ownerByFs.get(fsName) ?? ''
      if (owner) return sameDevice(owner, devicePath)
      const base = diskBaseName(fsName)
      if (base && diskBaseName(devicePath)) return base === diskBaseName(devicePath)
      return onlyDisk
    })
    .map((f) => ({
      mount: toStr(f.mount),
      fsType: toStr(f.type),
      sizeBytes: f.size ?? 0,
      usedBytes: f.used ?? 0
    }))
}

/**
 * systeminformation tra ve type "Unknown" cho NVMe cua Apple, nen phai ghep
 * moi manh thong tin (chuan giao tiep, ten o, chi so SMART) de doan cho dung.
 * Loai o quyet dinh nguong toc do doc/ghi khi cham diem.
 */
function inferStorageType(
  d: { interfaceType?: unknown; type?: unknown; name?: unknown },
  smart: SmartData | null
): StorageDevice['type'] {
  const text = `${toStr(d.interfaceType)} ${toStr(d.type)} ${toStr(d.name)}`
  if (/nvme|pci-?e/i.test(text)) return 'NVMe'
  if (/ssd|solid.?state|flash/i.test(text)) return 'SSD'
  if (/\bhdd?\b|hard.?disk|rotational|scsi/i.test(text)) return 'HDD'
  // Chi NVMe moi bao percentageUsed / mediaErrors trong SMART
  if (smart?.percentageUsed !== null && smart?.percentageUsed !== undefined) return 'NVMe'
  if (smart?.mediaErrors !== null && smart?.mediaErrors !== undefined) return 'NVMe'
  if (smart?.reallocatedSectors !== null && smart?.reallocatedSectors !== undefined) return 'HDD'
  return 'Unknown'
}

async function collectStorage(
  bundledBinDir: string | undefined,
  warnings: string[]
): Promise<StorageDevice[]> {
  const [layout, fsSizes, blockDevices] = await Promise.all([
    si.diskLayout(),
    si.fsSize(),
    si.blockDevices().catch(() => [] as si.Systeminformation.BlockDevicesData[])
  ])

  const ownerByFs = new Map<string, string>()
  const removableByDevice = new Map<string, boolean>()
  for (const b of blockDevices) {
    if (b.name && b.device) ownerByFs.set(toStr(b.name), toStr(b.device))
    if (b.type === 'disk' && b.device) removableByDevice.set(toStr(b.device), Boolean(b.removable))
  }
  const winCounters = isWin ? await win.readReliabilityCounters() : {}
  const macStatus = isMac ? await mac.readNvmeSmartStatus() : {}

  const devices: StorageDevice[] = []
  let smartctlMissing = false

  for (let i = 0; i < layout.length; i++) {
    const d = layout[i]
    const devPath = smartctlDevicePath(i, toStr(d.device))
    let smart = await readSmartctl(devPath, bundledBinDir)

    if (!smart) {
      smartctlMissing = true
      if (isWin) {
        const serial = toStr(d.serialNum).toLowerCase()
        smart = winCounters[serial] ?? Object.values(winCounters)[i] ?? null
      } else if (isMac) {
        const bsd = Object.keys(macStatus)[i]
        smart = bsd ? fromMacSmartStatus(macStatus[bsd]) : null
      }
    }

    const type = inferStorageType(d, smart)

    devices.push({
      device: devPath,
      name: toStr(d.name),
      model: toStr(d.name) || toStr(d.vendor),
      vendor: toStr(d.vendor),
      serial: toStr(d.serialNum),
      firmware: toStr(d.firmwareRevision),
      sizeBytes: d.size ?? 0,
      type,
      interfaceType: toStr(d.interfaceType),
      removable:
        Boolean((d as { removable?: boolean }).removable) ||
        (removableByDevice.get(devPath) ?? false),
      smart: smart ?? emptySmart('Không đọc được SMART trên ổ này'),
      partitions: partitionsOfDevice(devPath, fsSizes, ownerByFs, layout.length === 1)
    })
  }

  if (smartctlMissing) {
    warnings.push(
      'Không tìm thấy smartctl nên số liệu SMART bị rút gọn. Cài smartmontools để đọc đầy đủ giờ chạy, TBW, số lần bật máy.'
    )
  }
  return devices
}

/* ------------------------------------------------------------------ */
/* Pin                                                                 */
/* ------------------------------------------------------------------ */

function emptyBattery(): BatteryInfo {
  return {
    hasBattery: false,
    manufacturer: '',
    model: '',
    serial: '',
    chemistry: '',
    designedCapacityMWh: null,
    maxCapacityMWh: null,
    currentCapacityMWh: null,
    healthPercent: null,
    wearPercent: null,
    cycleCount: null,
    designCycleCount: null,
    voltageV: null,
    powerW: null,
    percent: null,
    isCharging: false,
    acConnected: true,
    timeRemainingMin: null,
    condition: null
  }
}

async function collectBattery(warnings: string[]): Promise<BatteryInfo> {
  const base = emptyBattery()
  try {
    const b = await si.battery()
    if (b.hasBattery) {
      const unitIsMah = /mah/i.test(toStr(b.capacityUnit))
      const voltage = toNum(b.voltage)
      const toMWh = (value: number | null): number | null => {
        if (value === null) return null
        return unitIsMah && voltage ? Math.round(value * voltage) : Math.round(value)
      }
      Object.assign(base, {
        hasBattery: true,
        manufacturer: toStr(b.manufacturer),
        model: toStr(b.model),
        serial: toStr(b.serial),
        chemistry: toStr(b.type, 'Li-ion'),
        designedCapacityMWh: toMWh(toNum(b.designedCapacity)),
        maxCapacityMWh: toMWh(toNum(b.maxCapacity)),
        currentCapacityMWh: toMWh(toNum(b.currentCapacity)),
        cycleCount: toNum(b.cycleCount),
        voltageV: voltage,
        percent: toNum(b.percent),
        isCharging: Boolean(b.isCharging),
        acConnected: Boolean(b.acConnected),
        timeRemainingMin: toNum(b.timeRemaining)
      } satisfies Partial<BatteryInfo>)
    }
  } catch (err) {
    warnings.push(`Đọc pin qua systeminformation thất bại: ${(err as Error).message}`)
  }

  const extras = isWin ? await win.readBattery() : isMac ? await mac.readBattery() : null
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value !== null && value !== undefined && value !== '') {
        ;(base as unknown as Record<string, unknown>)[key] = value
      }
    }
  }

  return base
}

/**
 * May ban (Mac mini, PC de ban) doi khi van bao hasBattery nhung moi chi so deu bang 0.
 * Phai loai bo truoc khi cham diem, neu khong bai test xa pin va phan tich do chai se chay sai.
 */
function finalizeBattery(base: BatteryInfo, machine: MachineInfo, warnings: string[]): BatteryInfo {
  if (!base.hasBattery) return base

  const noReading =
    !base.designedCapacityMWh &&
    !base.maxCapacityMWh &&
    !base.currentCapacityMWh &&
    !base.cycleCount &&
    !base.percent &&
    !base.voltageV

  if (noReading) {
    const isDesktop = /desktop|tower|mini|all[- ]?in[- ]?one|server|nettop|stick/i.test(
      machine.chassisType
    )
    if (!isDesktop) {
      warnings.push(
        'Hệ thống báo có pin nhưng mọi chỉ số đều bằng 0. Cần mở máy kiểm tra cáp pin và mạch sạc.'
      )
    }
    return emptyBattery()
  }

  if (base.healthPercent === null) {
    if (base.designedCapacityMWh && base.maxCapacityMWh) {
      base.healthPercent = round((base.maxCapacityMWh / base.designedCapacityMWh) * 100, 1)
      base.wearPercent = round(100 - (base.healthPercent ?? 0), 1)
    } else {
      warnings.push('Không đọc được dung lượng thiết kế của pin nên không tính được độ chai.')
    }
  }
  return base
}

/* ------------------------------------------------------------------ */
/* Man hinh & GPU                                                      */
/* ------------------------------------------------------------------ */

async function collectDisplaysAndGraphics(): Promise<{
  displays: DisplayInfo[]
  graphics: GraphicsController[]
}> {
  const g = await si.graphics()

  const graphics: GraphicsController[] = g.controllers.map((c) => ({
    vendor: toStr(c.vendor),
    model: toStr(c.model),
    vramBytes: c.vram ? c.vram * 1024 * 1024 : null,
    bus: toStr(c.bus),
    driverVersion: toStr(c.driverVersion),
    // GPU roi thuong co VRAM rieng va khong nam tren bus noi bo
    isDiscrete: !/intel|amd radeon graphics|apple/i.test(toStr(c.vendor)) || (c.vram ?? 0) > 2048
  }))

  const siDisplays: DisplayInfo[] = g.displays.map((d, index) => ({
    index,
    builtin: Boolean(d.builtin),
    vendorId: toStr(d.vendor) || null,
    vendorName: toStr(d.vendor) || null,
    model: toStr(d.model) || toStr(d.deviceName) || null,
    serialNumber: null,
    currentResX: toNum(d.currentResX),
    currentResY: toNum(d.currentResY),
    nativeResX: toNum(d.resolutionX),
    nativeResY: toNum(d.resolutionY),
    refreshRateHz: toNum(d.currentRefreshRate),
    pixelDepth: toNum(d.pixelDepth),
    sizeInches: d.sizeX && d.sizeY ? round(Math.hypot(d.sizeX, d.sizeY) / 25.4, 1) : null,
    physicalWidthMm: toNum(d.sizeX),
    physicalHeightMm: toNum(d.sizeY),
    manufactureWeek: null,
    manufactureYear: null,
    connection: toStr(d.connection) || null
  }))

  const edid = isWin ? await win.readDisplays() : isMac ? await mac.readDisplays() : []

  // Ghep du lieu EDID (co tuan/nam san xuat panel) vao danh sach cua systeminformation
  const merged = siDisplays.map((d, i) => {
    const e = edid[i]
    if (!e) return d
    return {
      ...d,
      vendorId: d.vendorId ?? e.vendorId,
      vendorName: d.vendorName ?? e.vendorName,
      model: d.model ?? e.model,
      serialNumber: e.serialNumber ?? d.serialNumber,
      nativeResX: d.nativeResX ?? e.nativeResX,
      nativeResY: d.nativeResY ?? e.nativeResY,
      refreshRateHz: d.refreshRateHz ?? e.refreshRateHz,
      sizeInches: d.sizeInches ?? e.sizeInches,
      physicalWidthMm: d.physicalWidthMm ?? e.physicalWidthMm,
      physicalHeightMm: d.physicalHeightMm ?? e.physicalHeightMm,
      manufactureWeek: e.manufactureWeek,
      manufactureYear: e.manufactureYear,
      connection: d.connection ?? e.connection,
      builtin: d.builtin || e.builtin
    }
  })

  return { displays: merged.length ? merged : edid, graphics }
}

/* ------------------------------------------------------------------ */
/* Mang & am thanh                                                     */
/* ------------------------------------------------------------------ */

/** Interface do he dieu hanh tu tao (AirDrop, tunnel, bridge...) chu khong phai cong that. */
const VIRTUAL_IFACE = /^(anpi|awdl|llw|utun|gif|stf|p2p|vmenet|bridge|ap\d|lo\d*$)/i
const VIRTUAL_NAME =
  /bridge|virtual|loopback|pseudo|tunnel|tap-|vpn|hyper-v|vmware|virtualbox|wsl|docker|teredo|miniport/i

/** MAC dat bit "locally administered" -> hau het la interface do phan mem sinh ra. */
function isLocallyAdministeredMac(mac: string): boolean {
  const firstOctet = Number.parseInt(mac.slice(0, 2), 16)
  return Number.isFinite(firstOctet) && (firstOctet & 0b10) !== 0
}

async function collectNetwork(): Promise<NetworkAdapter[]> {
  const ifaces = await si.networkInterfaces()
  const list = Array.isArray(ifaces) ? ifaces : [ifaces]
  const macStandards = isMac ? await mac.readWifiStandards() : {}
  const winStandards = isWin ? await win.readWifiStandards() : []
  const macPorts = isMac ? await mac.readHardwarePorts() : {}
  const hasPortList = Object.keys(macPorts).length > 0

  return list
    .filter((n) => !n.internal && !n.virtual && toStr(n.mac))
    .map((n) => ({ n, port: macPorts[toStr(n.iface)] ?? null }))
    .filter(({ n, port }) => {
      // macOS liet ke duoc dung cac cong vat ly -> dung lam danh sach trang
      if (hasPortList && !port) return false
      const label = `${toStr(n.iface)} ${toStr(n.ifaceName)} ${port?.name ?? ''}`
      if (VIRTUAL_NAME.test(label)) return false
      if (!hasPortList && VIRTUAL_IFACE.test(toStr(n.iface))) return false
      // Cong ao con lai deu co MAC tu sinh va khong he hoat dong
      const hardwareMac = port?.mac || toStr(n.mac)
      return (
        !isLocallyAdministeredMac(hardwareMac) || Boolean(n.ip4 || n.ip6 || toNum(n.speed))
      )
    })
    .map(({ n, port }) => {
      const label = `${n.type} ${toStr(n.ifaceName)} ${port?.name ?? ''}`
      const type: NetworkAdapter['type'] = /wireless|wi-?fi|airport/i.test(label)
        ? 'wifi'
        : /bluetooth/i.test(label)
          ? 'bluetooth'
          : /wired|ethernet|thunderbolt|lan/i.test(label)
            ? 'ethernet'
            : 'other'
      const standards = type === 'wifi' ? (macStandards[n.iface] ?? winStandards) : []
      return {
        iface: toStr(n.iface),
        name: port?.name || toStr(n.ifaceName) || toStr(n.iface),
        type,
        mac: port?.mac || toStr(n.mac),
        vendor: '',
        speedMbps: toNum(n.speed),
        driverVersion: null,
        standards
      }
    })
}

async function collectAudio(): Promise<AudioDeviceInfo[]> {
  try {
    const devices = await si.audio()
    return devices.map((a) => ({
      name: toStr(a.name),
      manufacturer: toStr(a.manufacturer),
      type: toStr(a.type),
      isInput: Boolean(a.in),
      isOutput: Boolean(a.out),
      isDefault: Boolean(a.default)
    }))
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Ham chinh                                                           */
/* ------------------------------------------------------------------ */

let cache: { profile: SystemProfile; at: number } | null = null
const CACHE_TTL_MS = 60_000

export interface CollectOptions {
  appVersion: string
  bundledBinDir?: string
  force?: boolean
}

export async function collectSystemProfile(opts: CollectOptions): Promise<SystemProfile> {
  if (!opts.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.profile

  const warnings: string[] = []
  const [privileged, machine, cpu, memory, storage, battery, dg, network, audio] =
    await Promise.all([
      isPrivileged(),
      collectMachine(warnings),
      collectCpu(),
      collectMemory(),
      collectStorage(opts.bundledBinDir, warnings),
      collectBattery(warnings),
      collectDisplaysAndGraphics(),
      collectNetwork(),
      collectAudio()
    ])

  const finalBattery = finalizeBattery(battery, machine, warnings)

  if (!privileged) {
    warnings.push(
      'Đang chạy ở quyền thường. Một số chỉ số (SMART, nhiệt độ, TPM) có thể thiếu hoặc không chính xác.'
    )
  }

  const profile: SystemProfile = {
    collectedAt: new Date().toISOString(),
    platform,
    privileged,
    appVersion: opts.appVersion,
    machine,
    cpu,
    memory,
    storage,
    battery: finalBattery,
    displays: dg.displays,
    graphics: dg.graphics,
    network,
    audio,
    warnings
  }

  cache = { profile, at: Date.now() }
  return profile
}
