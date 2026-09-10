import os from 'node:os'
import { Worker } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import type { PerfSample, SensorSnapshot, StressOptions, StressResult } from '@shared/types'
import { readSensors } from '../hardware/sensors'
import { round } from '../hardware/util'

export type ProgressFn = (phase: string, percent: number, message: string) => void

/** Moi worker bao cao thong luong sau moi khoang nay. */
const SAMPLE_MS = 1000

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

const startedAt = Date.now()
const endAt = startedAt + workerData.durationMs
const expected = computeBlock(workerData.seed)
let ops = BLOCK_ITERATIONS
let mismatches = 0

// Thong luong duoc chot theo tung cua so thoi gian de nhin ra luc may bat dau tut
let windowOps = 0
let windowStart = Date.now()

while (Date.now() < endAt) {
  if (computeBlock(workerData.seed) !== expected) mismatches++
  ops += BLOCK_ITERATIONS
  windowOps += BLOCK_ITERATIONS

  const now = Date.now()
  if (now - windowStart >= ${SAMPLE_MS}) {
    parentPort.postMessage({
      type: 'sample',
      atSec: Math.round((now - startedAt) / 1000),
      ops: windowOps,
      ms: now - windowStart
    })
    windowOps = 0
    windowStart = now
  }
}

parentPort.postMessage({ type: 'done', ops, checksum: expected, mismatches })
`

type WorkerMessage =
  | { type: 'done'; ops: number; checksum: number; mismatches: number }
  | { type: 'sample'; atSec: number; ops: number; ms: number }

/** Cong don thong luong cua moi worker vao dung giay tuong ung. */
class PerfCollector {
  private buckets = new Map<number, { ops: number; ms: number; reports: number }>()

  add(atSec: number, ops: number, ms: number): void {
    const bucket = this.buckets.get(atSec) ?? { ops: 0, ms: 0, reports: 0 }
    bucket.ops += ops
    bucket.ms += ms
    bucket.reports++
    this.buckets.set(atSec, bucket)
  }

  timeline(): PerfSample[] {
    return [...this.buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([atSec, b]) => {
        // ms la tong cua nhieu worker chay song song, chia lai de ra thoi gian thuc
        const wallMs = b.ms / b.reports
        return { atSec, mops: round(b.ops / (wallMs * 1000), 2) ?? 0 }
      })
      .filter((s) => s.mops > 0)
  }
}

/**
 * So thong luong on dinh luc dau voi luc cuoi.
 * Bo 2 mau dau (may con dang tang toc) va lay trung vi tung nua de khong bi
 * mot nhip nhieu lam sai ket qua.
 */
function perfDrop(timeline: PerfSample[]): number | null {
  const samples = timeline.slice(2)
  if (samples.length < 6) return null
  const median = (list: number[]): number => {
    const sorted = [...list].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  const half = Math.floor(samples.length / 2)
  const early = median(samples.slice(0, half).map((s) => s.mops))
  const late = median(samples.slice(half).map((s) => s.mops))
  if (!early) return null
  return round(Math.max(0, ((early - late) / early) * 100), 1)
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
  const perf = new PerfCollector()
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
            if (msg.type === 'sample') {
              perf.add(msg.atSec, msg.ops, msg.ms)
            } else if (msg.type === 'done') {
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
    // Chac chan khong con worker nao con song sau khi ham nay tra ve
    await Promise.all(workers.map((w) => w.terminate().catch(() => 0)))
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
  const perfTimeline = perf.timeline()

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
    perfDropPercent: perfDrop(perfTimeline),
    perfTimeline,
    errors,
    timeline
  }
}
