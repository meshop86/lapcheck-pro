import { useMemo, useState } from 'react'
import { Play, RotateCcw, SkipForward } from 'lucide-react'
import type { TestCategory, TestStatus } from '@shared/types'
import { Button, Card, Modal, ProgressBar, StatusBadge, inputClass } from '@/components/ui'
import { CATEGORY_LABEL, availableTests, testProgress, type TestDefinition } from '@/lib/testCatalog'
import { TEST_PANELS } from '@/tests'
import { useAppStore } from '@/store/useAppStore'
import { duration } from '@/lib/format'

const KIND_LABEL: Record<TestDefinition['kind'], string> = {
  interactive: 'Cần thao tác',
  automated: 'Tự động',
  manual: 'Quan sát tay'
}

export default function TestSuite() {
  const { profile, results, startTest, finishTest, skipTest, setNotes, resetTests } = useAppStore()
  const [openId, setOpenId] = useState<string | null>(null)

  const tests = useMemo(() => availableTests(profile), [profile])
  const grouped = useMemo(() => {
    const map = new Map<TestCategory, TestDefinition[]>()
    for (const t of tests) {
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    }
    return [...map.entries()]
  }, [tests])

  const { done } = testProgress(profile, results)

  const active = openId ? tests.find((t) => t.id === openId) : null
  const Panel = active ? TEST_PANELS[active.id] : null

  function open(id: string): void {
    startTest(id)
    setOpenId(id)
  }

  function handleFinish(
    id: string,
    status: TestStatus,
    summary: string,
    metrics?: Record<string, string | number>
  ): void {
    finishTest(id, status, summary, metrics)
    setOpenId(null)
  }

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Quy trình kiểm tra</h1>
          <p className="text-xs text-mist-400">
            Làm lần lượt từ trên xuống. Mỗi hạng mục đều ghi lại kết luận và số liệu vào báo cáo.
          </p>
        </div>
        <Button onClick={resetTests}>
          <RotateCcw size={14} />
          Bắt đầu máy mới
        </Button>
      </header>

      <ProgressBar percent={(done / tests.length) * 100} label={`Hoàn thành ${done}/${tests.length} hạng mục`} />

      {grouped.map(([category, items]) => (
        <Card key={category} title={CATEGORY_LABEL[category]}>
          <div className="space-y-2">
            {items.map((test) => {
              const result = results[test.id]
              return (
                <div
                  key={test.id}
                  className="rounded-lg border border-ink-700 bg-ink-850/60 px-3.5 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{test.name}</span>
                        <StatusBadge status={result?.status ?? 'pending'} />
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-mist-400">
                          {KIND_LABEL[test.kind]}
                        </span>
                        <span className="text-[10px] text-mist-400">{test.durationHint}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-mist-400">{test.purpose}</p>
                      {result?.summary && (
                        <p className="mt-1.5 text-xs text-slate-200">→ {result.summary}</p>
                      )}
                      {result?.durationMs ? (
                        <p className="text-[11px] text-mist-400">Thời gian: {duration(result.durationMs)}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" onClick={() => skipTest(test.id)}>
                        <SkipForward size={12} />
                        Bỏ qua
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => open(test.id)}>
                        <Play size={12} />
                        {result?.status === 'pending' ? 'Chạy' : 'Chạy lại'}
                      </Button>
                    </div>
                  </div>

                  {result && result.status !== 'pending' && (
                    <input
                      className={`${inputClass} mt-2 text-xs`}
                      value={result.notes}
                      onChange={(e) => setNotes(test.id, e.target.value)}
                      placeholder="Ghi chú riêng của kỹ thuật viên cho hạng mục này"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      {active && Panel && (
        <Modal
          title={active.name}
          subtitle={active.purpose}
          wide={active.id === 'keyboard'}
          onClose={() => setOpenId(null)}
        >
          <Panel
            onFinish={(status, summary, metrics) => handleFinish(active.id, status, summary, metrics)}
            onClose={() => setOpenId(null)}
          />
        </Modal>
      )}
    </div>
  )
}
