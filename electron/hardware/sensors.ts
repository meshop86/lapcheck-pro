import os from 'node:os'
import si from 'systeminformation'
import type { FanReading, SensorSnapshot } from '@shared/types'
import { round, toNum } from './util'
import * as win from './platform/windows'
import * as mac from './platform/darwin'

const isWin = os.platform() === 'win32'
const isMac = os.platform() === 'darwin'

/** Doc mot lat cat cam bien tai thoi diem hien tai. */
export async function readSensors(): Promise<SensorSnapshot> {
  const [load, temp, speed, mem] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.cpuTemperature().catch(() => null),
    si.cpuCurrentSpeed().catch(() => null),
    si.mem().catch(() => null)
  ])

  let cpuTempC = toNum(temp?.main)
  let gpuTempC: number | null = null
  let powerW: number | null = null
  let thermalPressure: string | null = null
  const fans: FanReading[] = []

  if (isWin) {
    const thermal = await win.readThermal()
    for (const sensor of thermal.lhm) {
      const value = toNum(sensor.Value)
      if (value === null) continue
      if (sensor.SensorType === 'Fan') {
        fans.push({ name: sensor.Name, rpm: Math.round(value), percent: null })
      } else if (sensor.SensorType === 'Temperature') {
        if (/gpu/i.test(sensor.Identifier)) gpuTempC = Math.max(gpuTempC ?? 0, value)
        else if (/cpu/i.test(sensor.Identifier)) cpuTempC = Math.max(cpuTempC ?? 0, value)
      } else if (sensor.SensorType === 'Power' && /package|total/i.test(sensor.Name)) {
        powerW = value
      }
    }
    if (cpuTempC === null && thermal.zones.length) {
      cpuTempC = Math.max(...thermal.zones)
    }
  }

  if (isMac) {
    const thermal = await mac.readThermal()
    cpuTempC = thermal.cpuTempC ?? cpuTempC
    gpuTempC = thermal.gpuTempC ?? gpuTempC
    powerW = thermal.powerW ?? powerW
    thermalPressure = thermal.thermalPressure
  }

  // si.cpuTemperature() tra 0 khi khong doc duoc -> coi nhu khong co du lieu
  if (cpuTempC !== null && cpuTempC <= 0) cpuTempC = null

  let batteryPercent: number | null = null
  try {
    const b = await si.battery()
    if (b.hasBattery) batteryPercent = toNum(b.percent)
  } catch {
    batteryPercent = null
  }

  return {
    timestamp: Date.now(),
    cpuLoadPercent: round(toNum(load?.currentLoad) ?? 0, 1) ?? 0,
    cpuTempC: round(cpuTempC, 1),
    gpuTempC: round(gpuTempC, 1),
    cpuFreqGHz: round(toNum(speed?.avg), 2),
    memoryUsedPercent: mem ? (round(((mem.total - mem.available) / mem.total) * 100, 1) ?? 0) : 0,
    fans,
    powerW: round(powerW, 1),
    batteryPercent,
    thermalPressure
  }
}

type SensorListener = (snapshot: SensorSnapshot) => void

/**
 * Bo phat cam bien theo chu ky. Nhieu man hinh cung dang ky mot lan doc
 * -> tranh goi WMI/PowerShell chong cheo lam nang may.
 */
class SensorMonitor {
  private timer: NodeJS.Timeout | null = null
  private listeners = new Set<SensorListener>()
  private reading = false
  private intervalMs = 1500

  subscribe(listener: SensorListener): () => void {
    this.listeners.add(listener)
    this.ensureRunning()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  setInterval(ms: number): void {
    this.intervalMs = Math.max(500, ms)
    if (this.timer) {
      this.stop()
      this.ensureRunning()
    }
  }

  private ensureRunning(): void {
    if (this.timer || this.listeners.size === 0) return
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    void this.tick()
  }

  private async tick(): Promise<void> {
    if (this.reading) return
    this.reading = true
    try {
      const snapshot = await readSensors()
      for (const listener of this.listeners) listener(snapshot)
    } catch {
      // Bo qua mot nhip doc loi, nhip sau se thu lai
    } finally {
      this.reading = false
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

export const sensorMonitor = new SensorMonitor()
