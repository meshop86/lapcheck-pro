import { randomBytes } from 'node:crypto'
import { open, unlink, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import os from 'node:os'
import type { DiskBenchOptions, DiskBenchResult } from '@shared/types'
import { run } from '../hardware/util'

const MB = 1024 * 1024
const RANDOM_BLOCK = 4 * 1024
const RANDOM_DURATION_MS = 3000

export type ProgressFn = (phase: string, percent: number, message: string) => void

/**
 * Xoa cache doc cua he dieu hanh de con so doc phan anh dung toc do o cung.
 * Chi lam duoc khi app chay voi quyen quan tri.
 */
async function dropReadCache(): Promise<boolean> {
  if (os.platform() === 'darwin') {
    const res = await run('purge', [], 60_000)
    // purge van thoat ma 0 khi thieu quyen, phai doc them thong bao loi
    return res.ok && !/not permitted|unable to purge/i.test(`${res.stderr} ${res.stdout}`)
  }
  if (os.platform() === 'linux') {
    await run('sync', [], 30_000)
    try {
      await writeFile('/proc/sys/vm/drop_caches', '3')
      return true
    } catch {
      return false
    }
  }
  return false
}

async function sequentialWrite(
  path: string,
  sizeBytes: number,
  blockSize: number,
  onProgress: ProgressFn
): Promise<number> {
  // Du lieu ngau nhien de tranh bo nen cua controller SSD lam sai ket qua
  const buffer = randomBytes(blockSize)
  const handle = await open(path, 'w')
  try {
    const start = performance.now()
    let written = 0
    while (written < sizeBytes) {
      const chunk = Math.min(blockSize, sizeBytes - written)
      await handle.write(buffer, 0, chunk, written)
      written += chunk
      if (written % (32 * MB) === 0) {
        onProgress('write', (written / sizeBytes) * 100, 'Dang do toc do ghi tuan tu')
      }
    }
    await handle.sync()
    const seconds = (performance.now() - start) / 1000
    return sizeBytes / MB / seconds
  } finally {
    await handle.close()
  }
}

async function sequentialRead(
  path: string,
  sizeBytes: number,
  blockSize: number,
  onProgress: ProgressFn
): Promise<number> {
  const buffer = Buffer.allocUnsafe(blockSize)
  const handle = await open(path, 'r')
  try {
    const start = performance.now()
    let read = 0
    while (read < sizeBytes) {
      const chunk = Math.min(blockSize, sizeBytes - read)
      await handle.read(buffer, 0, chunk, read)
      read += chunk
      if (read % (32 * MB) === 0) {
        onProgress('read', (read / sizeBytes) * 100, 'Dang do toc do doc tuan tu')
      }
    }
    const seconds = (performance.now() - start) / 1000
    return sizeBytes / MB / seconds
  } finally {
    await handle.close()
  }
}

interface RandomStats {
  iops: number
  avgLatencyMs: number
}

async function randomRead(path: string, fileSize: number): Promise<RandomStats> {
  const buffer = Buffer.allocUnsafe(RANDOM_BLOCK)
  const handle = await open(path, 'r')
  try {
    const maxOffset = Math.max(0, fileSize - RANDOM_BLOCK)
    const start = performance.now()
    let ops = 0
    while (performance.now() - start < RANDOM_DURATION_MS) {
      const offset = Math.floor(Math.random() * maxOffset)
      await handle.read(buffer, 0, RANDOM_BLOCK, offset)
      ops++
    }
    const seconds = (performance.now() - start) / 1000
    return { iops: ops / seconds, avgLatencyMs: (seconds * 1000) / ops }
  } finally {
    await handle.close()
  }
}

async function randomWrite(path: string, fileSize: number): Promise<RandomStats> {
  const buffer = randomBytes(RANDOM_BLOCK)
  const handle = await open(path, 'r+')
  try {
    const maxOffset = Math.max(0, fileSize - RANDOM_BLOCK)
    const start = performance.now()
    let ops = 0
    while (performance.now() - start < RANDOM_DURATION_MS) {
      const offset = Math.floor(Math.random() * maxOffset)
      await handle.write(buffer, 0, RANDOM_BLOCK, offset)
      ops++
      // Ep ghi xuong o cung dinh ky, neu khong se chi do toc do RAM
      if (ops % 64 === 0) await handle.sync()
    }
    await handle.sync()
    const seconds = (performance.now() - start) / 1000
    return { iops: ops / seconds, avgLatencyMs: (seconds * 1000) / ops }
  } finally {
    await handle.close()
  }
}

export async function runDiskBenchmark(
  options: DiskBenchOptions,
  onProgress: ProgressFn = () => {}
): Promise<DiskBenchResult & { cacheDropped: boolean }> {
  const fileSizeMB = Math.max(64, Math.min(4096, options.fileSizeMB || 512))
  const blockSize = Math.max(4, options.blockSizeKB || 1024) * 1024
  const sizeBytes = fileSizeMB * MB

  await mkdir(options.targetDir, { recursive: true })
  const path = join(options.targetDir, `lapcheck-bench-${Date.now()}.tmp`)
  const start = performance.now()

  try {
    onProgress('prepare', 0, `Tao file thu ${fileSizeMB} MB`)
    const seqWriteMBps = await sequentialWrite(path, sizeBytes, blockSize, onProgress)

    onProgress('cache', 0, 'Dang xoa cache he dieu hanh')
    const cacheDropped = await dropReadCache()

    const seqReadMBps = await sequentialRead(path, sizeBytes, blockSize, onProgress)

    onProgress('random-read', 0, 'Dang do IOPS doc ngau nhien 4K')
    const rr = await randomRead(path, sizeBytes)

    onProgress('random-write', 0, 'Dang do IOPS ghi ngau nhien 4K')
    const rw = await randomWrite(path, sizeBytes)

    return {
      targetDir: options.targetDir,
      fileSizeMB,
      seqWriteMBps: Math.round(seqWriteMBps),
      seqReadMBps: Math.round(seqReadMBps),
      randomReadIOPS: Math.round(rr.iops),
      randomWriteIOPS: Math.round(rw.iops),
      randomReadLatencyMs: Number(rr.avgLatencyMs.toFixed(3)),
      durationMs: Math.round(performance.now() - start),
      cacheDropped
    }
  } finally {
    await unlink(path).catch(() => {})
  }
}
