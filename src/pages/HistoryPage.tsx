import { useCallback, useEffect, useState } from 'react'
import { FileDown, RefreshCw, Trash2 } from 'lucide-react'
import type { Inspection, InspectionSummaryRow } from '@shared/types'
import { Button, Card, EmptyState, GRADE_TONE, Modal, StatusBadge } from '@/components/ui'
import { dateTime } from '@/lib/format'

export default function HistoryPage() {
  const [rows, setRows] = useState<InspectionSummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<Inspection | null>(null)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await window.lapcheck.listInspections())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(id: string): Promise<void> {
    try {
      setDetail(await window.lapcheck.getInspection(id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function exportPdf(id: string): Promise<void> {
    setBusyId(id)
    try {
      const inspection = await window.lapcheck.getInspection(id)
      if (!inspection) return
      const path = await window.lapcheck.exportPdf(inspection)
      await window.lapcheck.openPath(path)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId('')
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm(`Xoá phiếu ${id}? Thao tác này không hoàn tác được.`)) return
    try {
      await window.lapcheck.deleteInspection(id)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Lịch sử kiểm định</h1>
          <p className="text-xs text-mist-400">
            {rows.length} phiếu đã lưu trên máy này. Trùng serial nghĩa là máy đã từng qua cửa hàng.
          </p>
        </div>
        <Button onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} />
          Tải lại
        </Button>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <EmptyState
          title="Chưa có phiếu kiểm định nào"
          hint="Sau khi chạy xong bộ test, vào mục Báo cáo và bấm Lưu phiếu để ghi vào lịch sử."
        />
      ) : (
        <Card>
          <table className="w-full text-xs">
            <thead className="text-mist-400">
              <tr>
                <th className="py-1 text-left">Mã phiếu</th>
                <th className="py-1 text-left">Thời điểm</th>
                <th className="py-1 text-left">Máy</th>
                <th className="py-1 text-left">Serial</th>
                <th className="py-1 text-left">Kỹ thuật viên</th>
                <th className="py-1 text-center">Xếp loại</th>
                <th className="py-1 text-center">Kết quả test</th>
                <th className="py-1 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-ink-800">
                  <td className="py-2 font-mono">{row.id}</td>
                  <td className="py-2 whitespace-nowrap">{dateTime(row.createdAt)}</td>
                  <td className="py-2">{row.deviceLabel || '—'}</td>
                  <td className="py-2 font-mono text-[11px]">{row.serial || '—'}</td>
                  <td className="py-2">{row.technician || '—'}</td>
                  <td className="py-2 text-center">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 font-semibold ${GRADE_TONE[row.gradeLetter]}`}
                    >
                      {row.gradeLetter} · {row.score}
                    </span>
                  </td>
                  <td className="py-2 text-center tabular-nums">
                    <span className="text-emerald-300">{row.passed}</span> /{' '}
                    <span className="text-rose-300">{row.failed}</span> / {row.total}
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => void openDetail(row.id)}>
                        Xem
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void exportPdf(row.id)}
                        disabled={busyId === row.id}
                      >
                        <FileDown size={12} />
                        PDF
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void remove(row.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {detail && (
        <Modal
          title={`Phiếu ${detail.id}`}
          subtitle={`${detail.meta.deviceLabel} · ${dateTime(detail.createdAt)} · ${detail.profile.machine.serial}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="space-y-4">
            <div className={`rounded-xl border px-4 py-3 ${GRADE_TONE[detail.grade.letter]}`}>
              <span className="text-2xl font-bold">{detail.grade.letter}</span>
              <span className="ml-2 text-sm tabular-nums">{detail.grade.score}/100</span>
              <span className="ml-2 text-xs opacity-80">{detail.grade.label}</span>
            </div>

            {detail.findings.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-mist-300">Phát hiện</div>
                <ul className="space-y-1 text-xs text-mist-300">
                  {detail.findings.map((f) => (
                    <li key={f.code}>
                      <span className="text-slate-100">{f.title}</span> — {f.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <table className="w-full text-xs">
              <tbody className="text-slate-200">
                {detail.results.map((r) => (
                  <tr key={r.id} className="border-t border-ink-800">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-1.5 text-mist-300">{r.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setDetail(null)}>Đóng</Button>
              <Button variant="primary" onClick={() => void exportPdf(detail.id)}>
                <FileDown size={14} />
                Xuất PDF
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
