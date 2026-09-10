import { useState } from 'react'
import { FileDown, FolderOpen, Save } from 'lucide-react'
import type { Inspection } from '@shared/types'
import {
  Button,
  Card,
  Field,
  GRADE_TONE,
  SEVERITY_STYLE,
  StatusBadge,
  inputClass
} from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { availableTests } from '@/lib/testCatalog'
import { dateTime } from '@/lib/format'

const CONDITIONS: { id: Inspection['meta']['condition']; label: string }[] = [
  { id: 'new', label: 'Máy mới' },
  { id: 'used', label: 'Máy đã qua sử dụng' },
  { id: 'refurbished', label: 'Máy tân trang' }
]

export default function Report() {
  const { profile, meta, setMeta, results, analysis, buildInspection, savedId, setSavedId, appInfo } =
    useAppStore()
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pdfPath, setPdfPath] = useState('')
  const [current, setCurrent] = useState<Inspection | null>(null)

  if (!profile) return null
  const { grade, findings } = analysis()
  const tests = availableTests(profile).map((t) => results[t.id])
  const untested = tests.filter((r) => r.status === 'pending').length

  /** Dùng lại phiếu đã dựng để mã kiểm định không đổi giữa lần lưu và lần xuất PDF. */
  function ensureInspection(): Inspection | null {
    if (current) {
      const refreshed = { ...current, meta, results: tests, findings, grade }
      setCurrent(refreshed)
      return refreshed
    }
    const built = buildInspection()
    setCurrent(built)
    return built
  }

  async function handleSave(): Promise<void> {
    const inspection = ensureInspection()
    if (!inspection) return
    setBusy('save')
    setError('')
    try {
      const id = await window.chipLapTest.saveInspection(inspection)
      setSavedId(id)
      setMessage(`Đã lưu phiếu kiểm định ${id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function handleExport(): Promise<void> {
    const inspection = ensureInspection()
    if (!inspection) return
    setBusy('pdf')
    setError('')
    try {
      await window.chipLapTest.saveInspection(inspection)
      setSavedId(inspection.id)
      const path = await window.chipLapTest.exportPdf(inspection)
      setPdfPath(path)
      setMessage(`Đã xuất báo cáo: ${path}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  const bySeverity = (['critical', 'major', 'minor', 'info'] as const).map((severity) => ({
    severity,
    items: findings.filter((f) => f.severity === severity)
  }))

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Báo cáo kiểm định</h1>
          <p className="text-xs text-mist-400">
            {savedId ? `Mã phiếu ${savedId} · ` : ''}
            {untested > 0
              ? `Còn ${untested} hạng mục chưa chạy — điểm sẽ bị giới hạn`
              : 'Đã chạy đủ hạng mục'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void handleSave()} disabled={busy !== ''}>
            <Save size={14} />
            {busy === 'save' ? 'Đang lưu…' : 'Lưu phiếu'}
          </Button>
          <Button variant="primary" onClick={() => void handleExport()} disabled={busy !== ''}>
            <FileDown size={14} />
            {busy === 'pdf' ? 'Đang tạo PDF…' : 'Xuất PDF cho khách'}
          </Button>
        </div>
      </header>

      {message && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          <span>{message}</span>
          {pdfPath && (
            <button
              onClick={() => void window.chipLapTest.openPath(pdfPath)}
              className="flex items-center gap-1 text-xs underline"
            >
              <FolderOpen size={12} />
              Mở file
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card title="Thông tin phiếu" className="col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kỹ thuật viên">
              <input
                className={inputClass}
                value={meta.technician}
                onChange={(e) => setMeta({ technician: e.target.value })}
                placeholder="Họ tên người kiểm"
              />
            </Field>
            <Field label="Mã khách / mã đơn">
              <input
                className={inputClass}
                value={meta.customerRef}
                onChange={(e) => setMeta({ customerRef: e.target.value })}
                placeholder="Ví dụ: HD-2026-0142"
              />
            </Field>
            <Field label="Tên máy ghi trên phiếu">
              <input
                className={inputClass}
                value={meta.deviceLabel}
                onChange={(e) => setMeta({ deviceLabel: e.target.value })}
              />
            </Field>
            <Field label="Tình trạng máy">
              <select
                className={inputClass}
                value={meta.condition}
                onChange={(e) => setMeta({ condition: e.target.value as Inspection['meta']['condition'] })}
              >
                {CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Ghi chú chung">
                <textarea
                  className={`${inputClass} h-20 resize-none`}
                  value={meta.notes}
                  onChange={(e) => setMeta({ notes: e.target.value })}
                  placeholder="Thoả thuận bảo hành, phụ kiện kèm theo, điểm đã trao đổi với khách"
                />
              </Field>
            </div>
          </div>
          {appInfo && (
            <p className="mt-2 text-[11px] text-mist-400">
              Báo cáo lưu tại {appInfo.reportsDir}
            </p>
          )}
        </Card>

        <Card title="Kết quả chấm điểm">
          <div className={`rounded-xl border px-4 py-3 text-center ${GRADE_TONE[grade.letter]}`}>
            <div className="text-4xl font-bold leading-none">{grade.letter}</div>
            <div className="mt-1 text-sm font-medium tabular-nums">{grade.score}/100</div>
            <div className="text-xs opacity-80">{grade.label}</div>
          </div>
          {grade.deductions.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {grade.deductions.map((d, i) => (
                <li key={i} className="flex justify-between gap-2 text-mist-300">
                  <span>{d.reason}</span>
                  <span className="shrink-0 tabular-nums text-rose-300">−{d.points}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Phát hiện" subtitle={`${findings.length} mục`}>
        {findings.length === 0 ? (
          <p className="text-sm text-mist-400">Không có phát hiện nào.</p>
        ) : (
          <div className="space-y-3">
            {bySeverity
              .filter((group) => group.items.length > 0)
              .map((group) => {
                const style = SEVERITY_STYLE[group.severity]
                return (
                  <div key={group.severity}>
                    <div className={`mb-1.5 text-xs font-semibold ${style.text}`}>
                      {style.label} ({group.items.length})
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map((f) => (
                        <div key={f.code} className={`rounded-lg border px-3 py-2 ${style.border} ${style.bg}`}>
                          <div className="text-sm font-medium text-slate-100">{f.title}</div>
                          <div className="mt-0.5 text-xs leading-relaxed text-mist-300">{f.detail}</div>
                          {f.evidence && (
                            <div className="mt-1 text-[11px] text-mist-400">Bằng chứng: {f.evidence}</div>
                          )}
                          {f.recommendation && (
                            <div className="mt-0.5 text-[11px] text-mist-400">
                              Khuyến nghị: {f.recommendation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </Card>

      <Card title="Chi tiết từng hạng mục">
        <table className="w-full text-xs">
          <thead className="text-mist-400">
            <tr>
              <th className="py-1 text-left">Hạng mục</th>
              <th className="py-1 text-left">Kết quả</th>
              <th className="py-1 text-left">Kết luận</th>
              <th className="py-1 text-left">Thời điểm</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {tests.map((r) => (
              <tr key={r.id} className="border-t border-ink-800 align-top">
                <td className="py-2">{r.name}</td>
                <td className="py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2">
                  {r.summary || '—'}
                  {Object.keys(r.metrics).length > 0 && (
                    <div className="mt-0.5 text-[11px] text-mist-400">
                      {Object.entries(r.metrics)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')}
                    </div>
                  )}
                  {r.notes && <div className="mt-0.5 text-[11px] text-mist-400">Ghi chú: {r.notes}</div>}
                </td>
                <td className="py-2 whitespace-nowrap">{dateTime(r.finishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
