import os from 'node:os'
import { Worker } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import type { SensorSnapshot, StressOptions, StressResult } from '@shared/types'
import { readSensors } from '../hardware/sensors'
import { round } from '../hardware/util'

export type ProgressFn = (phase: string, percent: number, message: string) => void

/**
 * Vong lap tinh toan nang chay trong worker.
 * Tat ca worker dung chung mot seed -> checksum phai giong nhau.
 * Checksum lech nghia la CPU/RAM tinh sai khi nong: dau hieu may khong on dinh.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')

const BLOCK_ITERATIONS = 200000

/**
 * Mot khoi tinh toan co dinh: vua ep FPU vua tra ve checksum so nguyen.
 * Cung mot seed thi ket qua luon phai giong nhau - CPU/RAM on dinh la dieu kien duy nhat.
 */
function computeBlock(seed) {
  let float = seed
  let hash = 0x9e3779b9
  for (let i = 1; i <= BLOCK_ITERATIONS; i++) {
    float = Math.sqrt(float * 1.0000001 + i) + Math.sin(float % 3.14159)
    float = Math.abs((float * 1103515245 + 12345) % 2147483648) % 100000 + 1
    hash = (Math.imul(hash ^ (float | 0), 2246822507) ^ (hash >>> 13)) >>> 0
  }
  return hash >>> 0
}

const endAt = Date.now() + workerData.durationMs
const expected = computeBlock(workerData.seed)
let ops = BLOCK_ITERATIONS
let mismatches = 0

while (Date.now() < endAt) {
  if (computeBlock(workerData.seed) !== expected) mismatches++
  ops += BLOCK_ITERATIONS
}

parentPort.postMessage({ type: 'done', ops, checksum: expected, mismatches })
`

interface WorkerMessage {
  type: 'done'
  ops: number
  checksum: number
  mismatches: number
}

export async function runCpuStress(
  options: StressOptions,
  onProgress: ProgressFn = () => {},
  signal?: AbortSignal
): Promise<StressResult> {
  const durationSec = Math.max(10, Math.min(1800, options.durationSec || 300))
  const threads = Math.max(1, Math.min(options.threads || os.cpus().length, os.cpus().length * 2))
  const durationMs = durationSec * 1000
  const seed = 1.618033
  const timeline: SensorSnapshot[] = []
  const startedAt = performance.now()

  const sampler = setInterval(() => {
    void readSensors()
      .then((s) => timeline.push(s))
      .catch(() => {})
  }, 1000)

  const progressTimer = setInterval(() => {
    const elapsed = (performance.now() - startedAt) / 1000
    const last = timeline.at(-1)
    const temp = last?.cpuTempC !== null && last?.cpuTempC !== undefined ? `${last.cpuTempC}C` : 'n/a'
    onProgress(
      'stress',
      Math.min(100, (elapsed / durationSec) * 100),
      `Con ${Math.max(0, Math.round(durationSec - elapsed))}s - nhiet do ${temp}`
    )
  }, 1000)

  let totalOps = 0
  let errors = 0
  const checksums: number[] = []
  const workers: Worker[] = []

  const abort = (): void => {
    for (const w of workers) void w.terminate()
  }
  signal?.addEventListener('abort', abort, { once: true })

  try {
    await Promise.all(
      Array.from({ length: threads }, () => {
        const worker = new Worker(WORKER_SOURCE, {
          eval: true,
          workerData: { durationMs, seed }
        })
        workers.push(worker)
        return new Promise<void>((resolve) => {
          worker.on('message', (msg: WorkerMessage) => {
            if (msg.type === 'done') {
              totalOps += msg.ops
              errors += msg.mismatches
              checksums.push(msg.checksum)
            }
          })
          worker.on('error', () => {
            errors++
            resolve()
          })
          worker.on('exit', () => resolve())
        })
      })
    )
  } finally {
    clearInterval(sampler)
    clearInterval(progressTimer)
    signal?.removeEventListener('abort', abort)
  }

  // Cac worker chay cung mot khoi tinh toan -> checksum phai trung nhau
  const unique = new Set(checksums)
  if (unique.size > 1) errors += unique.size - 1

  const temps = timeline.map((t) => t.cpuTempC).filter((t): t is number => t !== null)
  const freqs = timeline.map((t) => t.cpuFreqGHz).filter((f): f is number => f !== null && f > 0)
  const rpms = timeline.flatMap((t) => t.fans.map((f) => f.rpm)).filter((r): r is number => r !== null)

  // Xung luc moi bat dau (5 mau dau) so voi xung thap nhat khi da nong
  const startFreq = freqs.length ? Math.max(...freqs.slice(0, 5)) : null
  const minFreq = freqs.length ? Math.min(...freqs.slice(Math.floor(freqs.length / 2))) : null

  const elapsedSec = (performance.now() - startedAt) / 1000

  return {
    durationSec: Math.round(elapsedSec),
    threads,
    totalOps,
    opsPerSec: Math.round(totalOps / elapsedSec),
    maxCpuTempC: temps.length ? Math.max(...temps) : null,
    avgCpuTempC: temps.length ? round(temps.reduce((a, b) => a + b, 0) / temps.length, 1) : null,
    maxFanRpm: rpms.length ? Math.max(...rpms) : null,
    startFreqGHz: startFreq,
    minFreqGHz: minFreq,
    throttlePercent:
      startFreq && minFreq ? round(((startFreq - minFreq) / startFreq) * 100, 1) : null,
    errors,
    timeline
  }
}
