import os from 'node:os'
import { Worker } from 'node:worker_threads'
import type { MemoryTestOptions, MemoryTestResult } from '@shared/types'

export type ProgressFn = (phase: string, percent: number, message: string) => void

/**
 * Kiem tra RAM bang cac mau bit kinh dien (giong nguyen ly cua MemTest86,
 * nhung chi cham duoc vung nho ma he dieu hanh cap cho tien trinh nay).
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const { sizeMB, passes } = workerData

/** Bam mot so nguyen thanh gia tri gia ngau nhien nhung lap lai duoc. */
function mix(value) {
  let x = value >>> 0
  x = Math.imul(x ^ (x >>> 16), 2246822507)
  x = Math.imul(x ^ (x >>> 13), 3266489909)
  return (x ^ (x >>> 16)) >>> 0
}

// Moi mau la ham thuan tuy theo vi tri byte -> ghi xong co the tinh lai gia tri
// dung de doi chieu, khong can giu ban sao trong RAM (ban sao cung co the loi).
const PATTERNS = [
  { name: '0x00', word: () => 0x00000000 },
  { name: '0xFF', word: () => 0xffffffff },
  { name: '0xAA (10101010)', word: () => 0xaaaaaaaa },
  { name: '0x55 (01010101)', word: () => 0x55555555 },
  { name: 'Dia chi trong dia chi', word: (offset) => offset >>> 0 },
  { name: 'Nguoc dia chi', word: (offset) => ~offset >>> 0 },
  { name: 'Gia ngau nhien (seed co dinh)', word: (offset) => mix(offset ^ 0x9e3779b9) }
]

const bytes = Math.floor(sizeMB * 1024 * 1024 / 4) * 4
let buffer
try {
  buffer = Buffer.allocUnsafe(bytes)
} catch (e) {
  parentPort.postMessage({ type: 'fatal', message: 'Khong cap phat duoc ' + sizeMB + ' MB RAM' })
  process.exit(0)
}

let errors = 0
let bytesProcessed = 0
const patternsRun = []
const started = Date.now()
const total = passes * PATTERNS.length
let step = 0

for (let pass = 0; pass < passes; pass++) {
  for (const pattern of PATTERNS) {
    for (let i = 0; i < bytes; i += 4) buffer.writeUInt32LE(pattern.word(i), i)
    for (let i = 0; i < bytes; i += 4) {
      if (buffer.readUInt32LE(i) !== pattern.word(i)) errors++
    }
    bytesProcessed += bytes * 2
    if (pass === 0) patternsRun.push(pattern.name)
    step++
    parentPort.postMessage({ type: 'progress', percent: (step / total) * 100, pattern: pattern.name })
  }
}

parentPort.postMessage({
  type: 'done',
  errors,
  bytesProcessed,
  patternsRun,
  durationMs: Date.now() - started
})
`

interface DoneMessage {
  type: 'done'
  errors: number
  bytesProcessed: number
  patternsRun: string[]
  durationMs: number
}

type Message =
  | DoneMessage
  | { type: 'progress'; percent: number; pattern: string }
  | { type: 'fatal'; message: string }

export async function runMemoryTest(
  options: MemoryTestOptions,
  onProgress: ProgressFn = () => {}
): Promise<MemoryTestResult> {
  // Khong bao gio lay qua 60% RAM trong de he dieu hanh khong phai swap
  const freeMB = Math.floor(os.freemem() / 1024 / 1024)
  const sizeMB = Math.max(64, Math.min(options.sizeMB || 1024, Math.floor(freeMB * 0.6)))
  const passes = Math.max(1, Math.min(options.passes || 2, 10))

  return new Promise<MemoryTestResult>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { sizeMB, passes } })
    let result: DoneMessage | null = null

    worker.on('message', (msg: Message) => {
      if (msg.type === 'progress') {
        onProgress('memory', msg.percent, `Dang kiem tra mau ${msg.pattern}`)
      } else if (msg.type === 'done') {
        result = msg
      } else {
        reject(new Error(msg.message))
      }
    })
    worker.on('error', reject)
    worker.on('exit', () => {
      if (!result) {
        reject(new Error('Kiem tra RAM ket thuc bat thuong'))
        return
      }
      const done: DoneMessage = result
      resolve({
        sizeMB,
        passes,
        errors: done.errors,
        throughputMBps: Math.round(done.bytesProcessed / 1024 / 1024 / (done.durationMs / 1000)),
        durationMs: done.durationMs,
        patternsRun: done.patternsRun
      })
    })
  })
}
