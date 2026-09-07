import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, inputClass } from '@/components/ui'
import { Instruction } from './shared'
import type { TestPanelProps } from './types'

const COLS = 28
const ROWS = 14
const TOTAL_CELLS = COLS * ROWS

type GestureId = 'leftClick' | 'rightClick' | 'doubleClick' | 'scrollDown' | 'scrollUp' | 'pinch' | 'drag'

const GESTURES: { id: GestureId; label: string; hint: string }[] = [
  { id: 'leftClick', label: 'Bấm trái', hint: 'Bấm một lần trong khung' },
  { id: 'rightClick', label: 'Bấm phải', hint: 'Bấm hai ngón hoặc góc dưới phải' },
  { id: 'doubleClick', label: 'Bấm đúp', hint: 'Bấm nhanh hai lần' },
  { id: 'drag', label: 'Kéo thả', hint: 'Giữ và rê con trỏ' },
  { id: 'scrollDown', label: 'Cuộn xuống', hint: 'Hai ngón vuốt xuống' },
  { id: 'scrollUp', label: 'Cuộn lên', hint: 'Hai ngón vuốt lên' },
  { id: 'pinch', label: 'Chụm phóng to', hint: 'Hai ngón chụm/mở' }
]

export default function TouchpadTest({ onFinish, onClose }: TestPanelProps) {
  const [covered, setCovered] = useState<Set<number>>(new Set())
  const [done, setDone] = useState<Set<GestureId>>(new Set())
  const [note, setNote] = useState('')
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const mark = (id: GestureId): void => setDone((prev) => new Set(prev).add(id))

  function paint(e: ReactPointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS)
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return
    const index = row * COLS + col
    setCovered((prev) => (prev.has(index) ? prev : new Set(prev).add(index)))
    // Kéo thả: giữ chuột và di chuyển quá 40px
    const start = dragStart.current
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 40) mark('drag')
  }

  function onWheel(e: WheelEvent<HTMLDivElement>): void {
    if (e.ctrlKey) mark('pinch')
    else if (e.deltaY > 0) mark('scrollDown')
    else if (e.deltaY < 0) mark('scrollUp')
  }

  const coveragePercent = (covered.size / TOTAL_CELLS) * 100
  const missingGestures = GESTURES.filter((g) => !done.has(g.id))

  function conclude(): void {
    const metrics: Record<string, string | number> = {
      'Độ phủ bề mặt': `${coveragePercent.toFixed(0)}%`,
      'Thao tác đạt': `${done.size}/${GESTURES.length}`,
      'Thao tác chưa được': missingGestures.map((g) => g.label).join(', ') || 'không có'
    }
    if (note.trim()) metrics['Ghi chú'] = note.trim()

    if (coveragePercent >= 85 && missingGestures.length === 0) {
      onFinish('passed', 'Touchpad nhận đủ thao tác, không có vùng chết', metrics)
    } else if (coveragePercent >= 60) {
      onFinish(
        'warning',
        `Phủ ${coveragePercent.toFixed(0)}% bề mặt, còn thiếu: ${missingGestures.map((g) => g.label).join(', ') || 'không'}`,
        metrics
      )
    } else {
      onFinish('failed', `Chỉ nhận ${coveragePercent.toFixed(0)}% bề mặt — nghi có vùng chết`, metrics)
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Rê ngón tay khắp mặt touchpad để tô kín khung dưới. Vùng nào không sáng lên là vùng chết.
        Sau đó thực hiện đủ các thao tác ở cột phải.
      </Instruction>

      <div className="flex gap-4">
        <div className="flex-1">
          <div
            className="relative h-64 select-none overflow-hidden rounded-xl border border-ink-600 bg-ink-950"
            onPointerMove={paint}
            onPointerDown={(e) => {
              dragStart.current = { x: e.clientX, y: e.clientY }
              paint(e)
            }}
            onPointerUp={() => {
              dragStart.current = null
              mark('leftClick')
            }}
            onDoubleClick={() => mark('doubleClick')}
            onContextMenu={(e) => {
              e.preventDefault()
              mark('rightClick')
            }}
            onWheel={onWheel}
          >
            <div
              className="grid h-full w-full"
              style={{
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`
              }}
            >
              {Array.from({ length: TOTAL_CELLS }, (_, i) => (
                <div
                  key={i}
                  className={`border-[0.5px] border-ink-900 ${
                    covered.has(i) ? 'bg-accent-500/70' : 'bg-ink-850'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-mist-300">
            <span>
              Độ phủ <strong className="text-accent-500">{coveragePercent.toFixed(0)}%</strong>
            </span>
            <button onClick={() => setCovered(new Set())} className="text-accent-500 hover:underline">
              Xoá vệt
            </button>
          </div>
        </div>

        <ul className="w-56 space-y-1.5">
          {GESTURES.map((g) => {
            const ok = done.has(g.id)
            return (
              <li
                key={g.id}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-ink-700 bg-ink-850 text-mist-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {ok && <Check size={12} />}
                  {g.label}
                </div>
                {!ok && <div className="text-[11px] text-mist-400">{g.hint}</div>}
              </li>
            )
          })}
        </ul>
      </div>

      <Field label="Ghi chú thêm">
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: nút bấm trái kêu lạch cạch, mặt kính xước"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude}>
          Kết luận touchpad
        </Button>
      </div>
    </div>
  )
}
