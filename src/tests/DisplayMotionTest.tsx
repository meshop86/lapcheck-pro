import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { DefectVerdict, FloatingHint, FullscreenLayer, Instruction } from './shared'
import type { TestPanelProps } from './types'

type Mode = 'motion' | 'inversion'

const DEFECTS = [
  { id: 'ghosting', label: 'Bóng mờ kéo dài rõ rệt', severe: true },
  { id: 'overshoot', label: 'Viền sáng ngược phía sau vật thể' },
  { id: 'inversion', label: 'Nhấp nháy khi hiện lưới ô cờ' },
  { id: 'tearing', label: 'Hình bị xé ngang khi chuyển động' },
  { id: 'framedrop', label: 'Giật hình, rớt khung' }
]

export default function DisplayMotionTest({ onFinish, onClose }: TestPanelProps) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [speed, setSpeed] = useState(900)
  const [fps, setFps] = useState(0)
  const [tried, setTried] = useState<Set<Mode>>(new Set())
  const trackRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const invertRef = useRef<HTMLDivElement>(null)

  // Vòng lặp vẽ: dịch chuyển vật thể theo thời gian thực và đo FPS thật của panel
  useEffect(() => {
    if (!mode) return
    let raf = 0
    let last = performance.now()
    let frames = 0
    let acc = 0
    let x = 0
    let dir = 1
    let phase = false

    const loop = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      frames += 1
      acc += dt
      if (acc >= 0.5) {
        setFps(Math.round(frames / acc))
        frames = 0
        acc = 0
      }

      if (mode === 'motion' && trackRef.current && boxRef.current) {
        const width = trackRef.current.clientWidth - boxRef.current.clientWidth
        x += dir * speed * dt
        if (x >= width) {
          x = width
          dir = -1
        } else if (x <= 0) {
          x = 0
          dir = 1
        }
        boxRef.current.style.transform = `translateX(${x}px)`
      }

      if (mode === 'inversion' && invertRef.current) {
        phase = !phase
        invertRef.current.style.backgroundPosition = phase ? '0 0' : '2px 2px'
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mode, speed])

  function open(next: Mode): void {
    setMode(next)
    setTried((prev) => new Set(prev).add(next))
  }

  if (mode === 'motion') {
    return (
      <FullscreenLayer background="#101010" onExit={() => setMode(null)}>
        <div ref={trackRef} className="relative flex h-full w-full items-center">
          <div ref={boxRef} className="will-change-transform">
            <div className="mb-6 h-24 w-24 rounded bg-white" />
            <div className="mb-6 h-24 w-24 rounded bg-[#ff3030]" />
            <div className="h-24 w-24 rounded bg-[#30ff60]" />
          </div>
        </div>
        <FloatingHint>
          Nhìn theo khối đang chạy, không nhìn cố định một điểm — {fps} FPS
          <div className="text-xs opacity-70">
            ↑ ↓ đổi tốc độ ({speed} px/giây) · Esc để thoát
          </div>
        </FloatingHint>
        <SpeedKeys onChange={setSpeed} />
      </FullscreenLayer>
    )
  }

  if (mode === 'inversion') {
    return (
      <FullscreenLayer background="#808080" onExit={() => setMode(null)}>
        <div
          ref={invertRef}
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%), linear-gradient(45deg, #000 25%, #fff 25%, #fff 75%, #000 75%)',
            backgroundSize: '4px 4px'
          }}
        />
        <FloatingHint>
          Lưới ô cờ đổi pha mỗi khung hình — {fps} FPS
          <div className="text-xs opacity-70">
            Màn tốt thấy xám phẳng. Thấy nhấp nháy hoặc gợn sóng là panel bị inversion.
          </div>
        </FloatingHint>
      </FullscreenLayer>
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Bài này lộ ra bóng mờ (ghosting) của panel cũ và hiện tượng nhấp nháy do mạch đảo cực. Nhìn
        theo vật thể chuyển động bằng mắt, đừng nhìn chằm chằm một điểm cố định.
      </Instruction>

      <div className="flex gap-2">
        <Button variant="primary" onClick={() => open('motion')}>
          Test bóng mờ chuyển động
        </Button>
        <Button variant="primary" onClick={() => open('inversion')}>
          Test nhấp nháy ô cờ
        </Button>
      </div>

      <DefectVerdict
        defects={DEFECTS}
        onSubmit={(found, note) => {
          const metrics: Record<string, string | number> = {
            'FPS đo được': fps || '—',
            'Bài đã chạy': `${tried.size}/2`,
            'Lỗi ghi nhận': found.map((f) => f.label).join(', ') || 'không có'
          }
          if (note) metrics['Ghi chú'] = note
          if (found.some((f) => f.severe)) {
            onFinish('failed', found.map((f) => f.label).join(', '), metrics)
          } else if (found.length > 0) {
            onFinish('warning', found.map((f) => f.label).join(', '), metrics)
          } else if (tried.size < 2) {
            onFinish('warning', 'Chưa chạy đủ hai bài kiểm tra chuyển động', metrics)
          } else {
            onFinish('passed', `Chuyển động mượt ở ${fps} FPS, không thấy bóng mờ`, metrics)
          }
        }}
      />

      <div className="flex justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}

/** Bắt phím mũi tên để đổi tốc độ khi đang ở chế độ toàn màn hình. */
function SpeedKeys({ onChange }: { onChange: (fn: (prev: number) => number) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowUp') onChange((s) => Math.min(3000, s + 300))
      if (e.key === 'ArrowDown') onChange((s) => Math.max(150, s - 300))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChange])
  return null
}
