import { useState } from 'react'
import { Button } from '@/components/ui'
import { DefectVerdict, FloatingHint, FullscreenLayer, Instruction } from './shared'
import type { TestPanelProps } from './types'

const LEVELS = [
  { color: '#000000', label: 'Đen tuyệt đối', purpose: 'Hở sáng viền (backlight bleed)' },
  { color: '#0a0a0a', label: 'Đen 4%', purpose: 'Chớp sáng góc, đèn nền không đều' },
  { color: '#1f1f1f', label: 'Xám tối', purpose: 'Vệt sáng loang giữa màn' },
  { color: '#c8c8c8', label: 'Xám sáng', purpose: 'Đốm ố, vết ép, bóng mờ tĩnh' },
  { color: '#ffffff', label: 'Trắng tối đa', purpose: 'Ngả vàng, chênh nhiệt màu hai bên' }
]

const DEFECTS = [
  { id: 'bleed-heavy', label: 'Hở sáng nặng (thấy rõ ở phòng sáng)', severe: true },
  { id: 'bleed-light', label: 'Hở sáng nhẹ (chỉ thấy trong tối)' },
  { id: 'clouding', label: 'Loang sáng giữa màn' },
  { id: 'burn-in', label: 'Bóng ma tĩnh / burn-in', severe: true },
  { id: 'yellow', label: 'Ngả vàng một vùng' },
  { id: 'pressure', label: 'Vết ép do kê vật lên máy' }
]

export default function DisplayUniformityTest({ onFinish, onClose }: TestPanelProps) {
  const [index, setIndex] = useState<number | null>(null)
  const [viewed, setViewed] = useState<Set<number>>(new Set())

  function open(i: number): void {
    setIndex(i)
    setViewed((prev) => new Set(prev).add(i))
  }

  if (index !== null) {
    const level = LEVELS[index]
    return (
      <FullscreenLayer background={level.color} onExit={() => setIndex(null)}>
        <div
          className="h-full w-full"
          onClick={() => (index + 1 < LEVELS.length ? open(index + 1) : setIndex(null))}
        />
        <FloatingHint>
          {level.label} — {level.purpose}
          <div className="text-xs opacity-70">Bấm để sang mức kế · Esc để thoát</div>
        </FloatingHint>
      </FullscreenLayer>
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Tắt hết đèn phòng và bật độ sáng màn hình tối đa. Nhìn thẳng chính diện — nhìn nghiêng luôn
        thấy hở sáng giả. Hở sáng nhẹ ở laptop cũ là bình thường, hở thành mảng lớn mới là lỗi.
      </Instruction>

      <div className="grid grid-cols-5 gap-2">
        {LEVELS.map((level, i) => (
          <button
            key={level.color}
            onClick={() => open(i)}
            className={`rounded-lg border p-2 text-[11px] transition-colors ${
              viewed.has(i) ? 'border-emerald-500/50' : 'border-ink-600 hover:border-accent-600'
            }`}
          >
            <div
              className="mb-1.5 h-10 w-full rounded border border-ink-700"
              style={{ background: level.color }}
            />
            <span className="text-mist-300">{level.label}</span>
          </button>
        ))}
      </div>

      <DefectVerdict
        defects={DEFECTS}
        onSubmit={(found, note) => {
          const metrics: Record<string, string | number> = {
            'Mức sáng đã kiểm': `${viewed.size}/${LEVELS.length}`,
            'Lỗi ghi nhận': found.map((f) => f.label).join(', ') || 'không có'
          }
          if (note) metrics['Ghi chú'] = note
          if (found.some((f) => f.severe)) {
            onFinish('failed', found.map((f) => f.label).join(', '), metrics)
          } else if (found.length > 0) {
            onFinish('warning', found.map((f) => f.label).join(', '), metrics)
          } else if (viewed.size < LEVELS.length) {
            onFinish('warning', `Mới kiểm ${viewed.size}/${LEVELS.length} mức sáng`, metrics)
          } else {
            onFinish('passed', 'Đèn nền đều, không hở sáng đáng kể', metrics)
          }
        }}
      />

      <div className="flex justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}
