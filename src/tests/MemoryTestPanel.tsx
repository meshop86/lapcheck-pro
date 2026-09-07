import { useState } from 'react'
import { Play } from 'lucide-react'
import type { MemoryTestResult } from '@shared/types'
import { Button, ProgressBar, StatTile } from '@/components/ui'
import { Instruction } from './shared'
import { newJobId, useJobProgress } from '@/lib/useJob'
import { useAppStore } from '@/store/useAppStore'
import type { TestPanelProps } from './types'

const JOB_ID = newJobId('mem')

export default function MemoryTestPanel({ onFinish, onClose }: TestPanelProps) {
  const profile = useAppStore((s) => s.profile)
  const progress = useJobProgress(JOB_ID)
  const totalGB = (profile?.memory.totalBytes ?? 0) / 1024 ** 3
  const suggested = Math.max(256, Math.round((totalGB * 1024 * 0.4) / 256) * 256)

  const [sizeMB, setSizeMB] = useState(suggested)
  const [passes, setPasses] = useState(2)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<MemoryTestResult | null>(null)

  async function run(): Promise<void> {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await window.lapcheck.runMemoryTest(JOB_ID, { sizeMB, passes }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function conclude(): void {
    if (!result) return
    const metrics: Record<string, string | number> = {
      'Dung lượng kiểm': `${result.sizeMB} MB`,
      'Số lượt quét': result.passes,
      'Mẫu bit đã chạy': result.patternsRun.join(', '),
      'Băng thông': `${result.throughputMBps.toFixed(0)} MB/s`,
      'Lỗi phát hiện': result.errors
    }
    if (result.errors > 0) {
      onFinish('failed', `Phát hiện ${result.errors} lỗi bit — RAM hỏng, cần thay`, metrics)
    } else {
      onFinish(
        'passed',
        `Không lỗi trên ${result.sizeMB} MB × ${result.passes} lượt (${result.throughputMBps.toFixed(0)} MB/s)`,
        metrics
      )
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Ghi rồi đọc lại nhiều mẫu bit trên vùng nhớ lớn để tìm ô nhớ lỗi — nguyên nhân thường gặp của
        màn hình xanh và treo máy ngẫu nhiên. Bài này chỉ kiểm được phần RAM trống, không thay thế
        MemTest86 chạy từ USB, nhưng đủ để lộ RAM lỗi nặng.
      </Instruction>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-mist-300">
            Dung lượng kiểm: <strong className="text-slate-100">{sizeMB} MB</strong> (máy có{' '}
            {totalGB.toFixed(0)} GB)
          </span>
          <input
            type="range"
            min={256}
            max={Math.max(512, Math.round(totalGB * 1024 * 0.6))}
            step={256}
            value={sizeMB}
            disabled={running}
            onChange={(e) => setSizeMB(Number(e.target.value))}
            className="w-full accent-sky-500"
          />
        </label>
        <label className="text-xs text-mist-300">
          <span className="mb-1 block">Số lượt</span>
          <select
            value={passes}
            disabled={running}
            onChange={(e) => setPasses(Number(e.target.value))}
            className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm text-slate-100"
          >
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n} lượt
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" onClick={() => void run()} disabled={running}>
          <Play size={14} />
          {running ? 'Đang quét…' : 'Chạy kiểm tra RAM'}
        </Button>
      </div>

      {running && (
        <ProgressBar percent={progress?.percent ?? 0} label={progress?.message ?? 'Cấp phát bộ nhớ…'} />
      )}

      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Lỗi bit"
            value={result.errors}
            tone={result.errors > 0 ? 'bad' : 'good'}
            hint={result.errors > 0 ? 'RAM cần thay' : 'không phát hiện lỗi'}
          />
          <StatTile label="Băng thông" value={result.throughputMBps.toFixed(0)} hint="MB/s" />
          <StatTile label="Mẫu bit" value={result.patternsRun.length} hint={result.patternsRun.join(', ')} />
        </div>
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
