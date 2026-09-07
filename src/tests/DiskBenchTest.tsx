import { useState } from 'react'
import { Play } from 'lucide-react'
import type { DiskBenchResult } from '@shared/types'
import { Button, ProgressBar, StatTile } from '@/components/ui'
import { Instruction } from './shared'
import { newJobId, useJobProgress } from '@/lib/useJob'
import { useAppStore } from '@/store/useAppStore'
import type { TestPanelProps } from './types'

const JOB_ID = newJobId('disk')

const SIZES = [256, 512, 1024]

/** Ngưỡng tốc độ đọc tuần tự (MB/s) coi là đạt / cần lưu ý theo loại ổ. */
const READ_THRESHOLD: Record<string, { good: number; warn: number }> = {
  NVMe: { good: 1200, warn: 700 },
  SSD: { good: 400, warn: 250 },
  HDD: { good: 80, warn: 50 },
  Unknown: { good: 200, warn: 100 }
}

/**
 * Khi không xoá được cache đọc của hệ điều hành, số đọc chỉ là tốc độ RAM.
 * Lúc đó chấm điểm theo tốc độ ghi — phép ghi có gọi sync nên luôn chạm ổ thật.
 */
const WRITE_THRESHOLD: Record<string, { good: number; warn: number }> = {
  NVMe: { good: 700, warn: 350 },
  SSD: { good: 250, warn: 120 },
  HDD: { good: 60, warn: 35 },
  Unknown: { good: 150, warn: 80 }
}

export default function DiskBenchTest({ onFinish, onClose }: TestPanelProps) {
  const profile = useAppStore((s) => s.profile)
  const progress = useJobProgress(JOB_ID)
  const [sizeMB, setSizeMB] = useState(512)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<(DiskBenchResult & { cacheDropped: boolean }) | null>(null)

  const drive = profile?.storage[0]
  const driveType = drive?.type ?? 'Unknown'
  const threshold = READ_THRESHOLD[driveType] ?? READ_THRESHOLD.Unknown
  const writeThreshold = WRITE_THRESHOLD[driveType] ?? WRITE_THRESHOLD.Unknown
  const readIsReal = result?.cacheDropped ?? false

  async function run(): Promise<void> {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const data = await window.lapcheck.runDiskBenchmark(JOB_ID, {
        targetDir: '',
        fileSizeMB: sizeMB,
        blockSizeKB: 1024
      })
      setResult(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function conclude(): void {
    if (!result) return
    const metrics: Record<string, string | number> = {
      'Loại ổ': driveType,
      'Ghi tuần tự': `${result.seqWriteMBps.toFixed(0)} MB/s`,
      'Đọc tuần tự': `${result.seqReadMBps.toFixed(0)} MB/s`,
      'IOPS đọc ngẫu nhiên 4K': Math.round(result.randomReadIOPS),
      'IOPS ghi ngẫu nhiên 4K': Math.round(result.randomWriteIOPS),
      'Độ trễ đọc': `${result.randomReadLatencyMs.toFixed(3)} ms`,
      'Kích thước file test': `${result.fileSizeMB} MB`,
      'Đã xoá cache đọc': result.cacheDropped ? 'có' : 'không'
    }
    if (result.cacheDropped) {
      const read = result.seqReadMBps
      if (read >= threshold.good) {
        onFinish('passed', `Đọc ${read.toFixed(0)} MB/s — đúng tầm ổ ${driveType}`, metrics)
      } else if (read >= threshold.warn) {
        onFinish('warning', `Đọc ${read.toFixed(0)} MB/s — thấp hơn mức kỳ vọng của ổ ${driveType}`, metrics)
      } else {
        onFinish('failed', `Đọc chỉ ${read.toFixed(0)} MB/s — nghi ổ xuống cấp hoặc sai chuẩn`, metrics)
      }
      return
    }

    const write = result.seqWriteMBps
    const note = 'chấm theo tốc độ ghi vì chưa xoá được cache đọc'
    if (write >= writeThreshold.good) {
      onFinish('passed', `Ghi ${write.toFixed(0)} MB/s — đúng tầm ổ ${driveType} (${note})`, metrics)
    } else if (write >= writeThreshold.warn) {
      onFinish('warning', `Ghi ${write.toFixed(0)} MB/s — thấp hơn kỳ vọng của ổ ${driveType} (${note})`, metrics)
    } else {
      onFinish('failed', `Ghi chỉ ${write.toFixed(0)} MB/s — nghi ổ xuống cấp hoặc sai chuẩn (${note})`, metrics)
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Bài đo ghi rồi đọc lại một file thật trên ổ hệ thống. Số liệu thấp bất thường so với loại ổ
        là dấu hiệu ổ đã mòn, bị giả dung lượng, hoặc đang chạy sai chuẩn giao tiếp.
        {drive && (
          <>
            {' '}Ổ đang đo: <strong>{drive.model || drive.name}</strong> ({driveType},{' '}
            {drive.interfaceType || 'không rõ giao tiếp'}).
          </>
        )}
      </Instruction>

      <div className="flex items-center gap-3">
        <span className="text-xs text-mist-300">Kích thước file test</span>
        <div className="flex gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSizeMB(s)}
              disabled={running}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                sizeMB === s
                  ? 'border-accent-600 bg-accent-600/20 text-accent-500'
                  : 'border-ink-600 text-mist-300 hover:text-slate-100'
              }`}
            >
              {s} MB
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => void run()} disabled={running}>
          <Play size={14} />
          {running ? 'Đang đo…' : 'Chạy đo tốc độ'}
        </Button>
      </div>

      {running && (
        <ProgressBar
          percent={progress?.percent ?? 0}
          label={progress?.message ?? 'Chuẩn bị file test…'}
        />
      )}

      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <>
          <div className="grid grid-cols-4 gap-2">
            <StatTile
              label="Đọc tuần tự"
              value={`${result.seqReadMBps.toFixed(0)}`}
              hint={readIsReal ? 'MB/s' : 'MB/s (có cache)'}
              tone={
                !readIsReal
                  ? undefined
                  : result.seqReadMBps >= threshold.good
                    ? 'good'
                    : result.seqReadMBps >= threshold.warn
                      ? 'warn'
                      : 'bad'
              }
            />
            <StatTile
              label="Ghi tuần tự"
              value={`${result.seqWriteMBps.toFixed(0)}`}
              hint="MB/s"
              tone={
                readIsReal
                  ? undefined
                  : result.seqWriteMBps >= writeThreshold.good
                    ? 'good'
                    : result.seqWriteMBps >= writeThreshold.warn
                      ? 'warn'
                      : 'bad'
              }
            />
            <StatTile label="Đọc 4K" value={Math.round(result.randomReadIOPS)} hint="IOPS" />
            <StatTile label="Ghi 4K" value={Math.round(result.randomWriteIOPS)} hint="IOPS" />
          </div>
          <p className="text-[11px] text-mist-400">
            Độ trễ đọc ngẫu nhiên {result.randomReadLatencyMs.toFixed(3)} ms.{' '}
            {result.cacheDropped
              ? 'Đã xoá cache đọc của hệ điều hành nên số đọc là tốc độ thật của ổ.'
              : 'Chưa xoá được cache đọc (cần chạy app với quyền quản trị) — số đọc và IOPS chỉ là tốc độ RAM, kết luận dựa trên tốc độ ghi.'}
          </p>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude} disabled={!result}>
          Ghi kết quả
        </Button>
      </div>
    </div>
  )
}
