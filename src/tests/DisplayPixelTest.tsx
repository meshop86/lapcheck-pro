import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { DefectVerdict, FloatingHint, FullscreenLayer, Instruction } from './shared'
import type { TestPanelProps } from './types'

interface ColorStep {
  color: string
  name: string
  purpose: string
}

const STEPS: ColorStep[] = [
  { color: '#ff0000', name: 'Đỏ', purpose: 'Điểm chết lộ ra dưới nền đơn sắc' },
  { color: '#00ff00', name: 'Lục', purpose: 'Nền lục dễ thấy điểm sáng nhất' },
  { color: '#0000ff', name: 'Lam', purpose: 'Kiểm tra subpixel xanh dương' },
  { color: '#ffffff', name: 'Trắng', purpose: 'Điểm chết đen và bụi kẹt trong panel' },
  { color: '#000000', name: 'Đen', purpose: 'Điểm sáng kẹt và hở sáng' },
  { color: '#808080', name: 'Xám 50%', purpose: 'Ám màu, loang màu, đốm ố' },
  { color: '#00ffff', name: 'Lơ', purpose: 'Kiểm tra pha trộn lục + lam' },
  { color: '#ff00ff', name: 'Cánh sen', purpose: 'Kiểm tra pha trộn đỏ + lam' },
  { color: '#ffff00', name: 'Vàng', purpose: 'Kiểm tra pha trộn đỏ + lục' }
]

const DEFECTS = [
  { id: 'dead', label: 'Điểm chết (chấm đen)', severe: true },
  { id: 'stuck', label: 'Điểm sáng kẹt màu', severe: true },
  { id: 'line', label: 'Sọc dọc/ngang', severe: true },
  { id: 'tint', label: 'Ám màu, loang màu' },
  { id: 'stain', label: 'Đốm ố, vết ép' },
  { id: 'dust', label: 'Bụi kẹt trong panel' }
]

export default function DisplayPixelTest({ onFinish, onClose }: TestPanelProps) {
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [seen, setSeen] = useState(0)

  const next = useCallback(() => {
    // Xem xong mau cuoi thi tu thoat, ky thuat vien khong phai nho bam Esc
    if (step >= STEPS.length - 1) {
      setSeen(STEPS.length)
      setRunning(false)
      return
    }
    const value = step + 1
    setStep(value)
    setSeen((max) => Math.max(max, value + 1))
  }, [step])

  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), [])

  useEffect(() => {
    if (!running) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === ' ') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, next, prev])

  if (running) {
    const current = STEPS[step]
    return (
      <FullscreenLayer background={current.color} onExit={() => setRunning(false)}>
        <div className="h-full w-full" onClick={next} />
        <FloatingHint>
          {current.name} ({step + 1}/{STEPS.length}) — {current.purpose}
          <div className="text-xs opacity-70">Bấm chuột hoặc → để sang màu kế · Esc để thoát</div>
        </FloatingHint>
      </FullscreenLayer>
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Màn hình sẽ phủ lần lượt 9 màu toàn khung. Ghé sát nhìn từng góc, đặc biệt bốn cạnh — điểm
        chết thường nằm ở rìa. Nên tắt đèn phòng khi xem nền đen.
      </Instruction>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={() => {
            setStep(0)
            setSeen((max) => Math.max(max, 1))
            setRunning(true)
          }}
        >
          {seen > 0 ? 'Xem lại toàn màn hình' : 'Bắt đầu phủ màu'}
        </Button>
        <span className="text-xs text-mist-400">
          Đã xem {seen}/{STEPS.length} màu
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs text-mist-300">Kết luận sau khi quan sát:</p>
        <DefectVerdict
          defects={DEFECTS}
          onSubmit={(found, note) => {
            const metrics: Record<string, string | number> = {
              'Số màu đã kiểm': `${seen}/${STEPS.length}`,
              'Lỗi ghi nhận': found.map((f) => f.label).join(', ') || 'không có'
            }
            if (note) metrics['Ghi chú'] = note
            if (found.some((f) => f.severe)) {
              onFinish('failed', found.map((f) => f.label).join(', '), metrics)
            } else if (found.length > 0) {
              onFinish('warning', found.map((f) => f.label).join(', '), metrics)
            } else if (seen < STEPS.length) {
              onFinish('warning', `Mới kiểm ${seen}/${STEPS.length} màu`, metrics)
            } else {
              onFinish('passed', 'Không phát hiện điểm chết hay ám màu', metrics)
            }
          }}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}
