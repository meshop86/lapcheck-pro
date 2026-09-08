import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, HardDrive, Info, ShieldAlert } from 'lucide-react'
import type { StorageDevice } from '@shared/types'
import { assessDisks, VERDICT_LABEL, type DiskHealth, type DiskIssue } from '@shared/diskHealth'
import { Button } from '@/components/ui'
import { bytes, joinParts } from '@/lib/format'
import { useAppStore } from '@/store/useAppStore'
import { Instruction } from './shared'
import type { TestPanelProps } from './types'

const VERDICT_TONE: Record<DiskHealth['verdict'], string> = {
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  fair: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  poor: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  failing: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  unknown: 'border-ink-600 bg-ink-850 text-mist-300'
}

const ISSUE_ICON: Record<DiskIssue['level'], typeof Info> = {
  bad: ShieldAlert,
  warn: AlertTriangle,
  info: Info
}

const ISSUE_TONE: Record<DiskIssue['level'], string> = {
  bad: 'text-rose-300',
  warn: 'text-amber-300',
  info: 'text-mist-400'
}

/** Cac chi so SMART dang mot dong, bo qua o khong doc duoc */
function smartLine(device: StorageDevice): string {
  const s = device.smart
  return joinParts([
    s.powerOnHours !== null ? `${s.powerOnHours.toLocaleString('vi-VN')} giờ chạy` : null,
    s.powerCycles !== null ? `${s.powerCycles.toLocaleString('vi-VN')} lần bật` : null,
    s.percentageUsed !== null ? `đã dùng ${s.percentageUsed}% tuổi thọ` : null,
    s.temperatureC !== null ? `${s.temperatureC}°C` : null,
    s.source ? `nguồn: ${s.source}` : null
  ])
}

export default function DiskHealthTest({ onFinish, onClose }: TestPanelProps) {
  const refreshProfile = useAppStore((s) => s.refreshProfile)
  const [disks, setDisks] = useState<DiskHealth[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fresh = await window.lapcheck.getSystemProfile(true)
      setDisks(assessDisks(fresh.storage))
      await refreshProfile()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [refreshProfile])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="py-6 text-center text-sm text-mist-400">Đang đọc SMART của ổ cứng…</p>
  }

  if (error || !disks) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-300">{error ?? 'Không đọc được dữ liệu ổ cứng.'}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Đóng</Button>
          <Button variant="primary" onClick={() => void load()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  function conclude(): void {
    const list = disks as DiskHealth[]
    const metrics: Record<string, string | number> = {}
    for (const d of list) {
      const label = d.device.model || d.device.name || d.device.device
      metrics[label] = joinParts([
        VERDICT_LABEL[d.verdict],
        d.score !== null ? `${d.score}/100` : null,
        smartLine(d.device) !== '—' ? smartLine(d.device) : null
      ])
    }

    const failing = list.filter((d) => d.verdict === 'failing' || d.verdict === 'poor')
    const unknown = list.filter((d) => d.verdict === 'unknown')
    const fair = list.filter((d) => d.verdict === 'fair')

    if (failing.length) {
      onFinish(
        'failed',
        failing.map((d) => `${d.device.model || d.device.name}: ${d.summary}`).join('; '),
        metrics
      )
    } else if (unknown.length) {
      onFinish('warning', `Không đọc được SMART của ${unknown.length} ổ — chưa kết luận được`, metrics)
    } else if (fair.length) {
      onFinish('warning', fair.map((d) => `${d.device.model || d.device.name}: ${d.summary}`).join('; '), metrics)
    } else {
      onFinish('passed', 'Tất cả ổ trong máy đều khoẻ', metrics)
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Chỉ số SMART do chính ổ cứng ghi lại, không thể sửa bằng cách cài lại Windows hay macOS —
        đây là bằng chứng đáng tin nhất về tuổi thật của máy.
      </Instruction>

      {disks.length === 0 && (
        <p className="text-sm text-rose-300">Không phát hiện ổ cứng trong nào.</p>
      )}

      <div className="space-y-3">
        {disks.map((d) => (
          <div key={d.device.device} className="rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <HardDrive size={16} className="mt-0.5 text-mist-400" />
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    {d.device.model || d.device.name || d.device.device}
                  </div>
                  <div className="text-[11px] text-mist-400">
                    {joinParts([d.device.type, bytes(d.device.sizeBytes), d.device.interfaceType])}
                  </div>
                </div>
              </div>
              <div
                className={`shrink-0 rounded-lg border px-3 py-1 text-center ${VERDICT_TONE[d.verdict]}`}
              >
                <div className="text-sm font-semibold leading-tight">
                  {d.score !== null ? d.score : '—'}
                </div>
                <div className="text-[10px] opacity-80">{VERDICT_LABEL[d.verdict]}</div>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-mist-300">{smartLine(d.device)}</div>

            <ul className="mt-2 space-y-1">
              {d.issues.map((issue, i) => {
                const Icon = ISSUE_ICON[issue.level]
                return (
                  <li key={i} className={`flex gap-2 text-[11px] ${ISSUE_TONE[issue.level]}`}>
                    <Icon size={12} className="mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{issue.text}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button onClick={() => void load()}>Đọc lại</Button>
        <Button variant="primary" onClick={conclude} disabled={disks.length === 0}>
          Ghi kết luận
        </Button>
      </div>
    </div>
  )
}
