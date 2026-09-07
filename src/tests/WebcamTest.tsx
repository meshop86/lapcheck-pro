import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { DefectVerdict, Instruction, MediaFailurePanel, mediaFailure, type MediaFailure } from './shared'
import type { TestPanelProps } from './types'

const DEFECTS = [
  { id: 'no-image', label: 'Không lên hình', severe: true },
  { id: 'black', label: 'Hình đen hoàn toàn', severe: true },
  { id: 'stripe', label: 'Sọc, nhiễu hạt nặng', severe: true },
  { id: 'blur', label: 'Mờ, mất nét' },
  { id: 'dark', label: 'Tối bất thường' },
  { id: 'color', label: 'Sai màu, ám tím/xanh' }
]

export default function WebcamTest({ onFinish, onClose }: TestPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [failure, setFailure] = useState<MediaFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [label, setLabel] = useState('')
  const [resolution, setResolution] = useState('')
  const [declaredFps, setDeclaredFps] = useState(0)
  const [measuredFps, setMeasuredFps] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer = 0
    let frames = 0

    async function start(): Promise<void> {
      setFailure(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        setLabel(track.label)
        setResolution(`${settings.width ?? '?'} × ${settings.height ?? '?'}`)
        setDeclaredFps(Math.round(settings.frameRate ?? 0))

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => undefined)

        // Đếm khung hình thật để so với FPS mà driver khai báo
        const video2 = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number
        }
        if (video2.requestVideoFrameCallback) {
          const onFrame = (): void => {
            frames += 1
            video2.requestVideoFrameCallback?.(onFrame)
          }
          video2.requestVideoFrameCallback(onFrame)
          timer = window.setInterval(() => {
            setMeasuredFps(frames)
            frames = 0
          }, 1000)
        }
      } catch (err) {
        setFailure(mediaFailure(err, 'webcam'))
      }
    }
    void start()

    return () => {
      cancelled = true
      window.clearInterval(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // attempt tang len khi bam "Thu lai" -> mo lai camera tu dau
  }, [attempt])

  if (failure) {
    return (
      <MediaFailurePanel
        failure={failure}
        hint="Nếu máy có nắp che vật lý hoặc công tắc tắt camera, hãy kiểm tra trước khi kết luận hỏng."
        onRetry={() => setAttempt((n) => n + 1)}
        onClose={onClose}
        onFail={() => onFinish('failed', failure.message)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Che tay trước ống kính rồi bỏ ra để xem camera có bắt sáng lại kịp không. Kiểm tra cả nắp
        che vật lý và đèn báo hoạt động bên cạnh ống kính.
      </Instruction>

      <div className="overflow-hidden rounded-xl border border-ink-700 bg-black">
        <video ref={videoRef} muted playsInline className="mx-auto max-h-72 w-auto" />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
          <div className="text-mist-400">Độ phân giải</div>
          <div className="text-slate-100 tabular-nums">{resolution || '—'}</div>
        </div>
        <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
          <div className="text-mist-400">FPS khai báo</div>
          <div className="text-slate-100 tabular-nums">{declaredFps || '—'}</div>
        </div>
        <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
          <div className="text-mist-400">FPS đo thật</div>
          <div className="text-slate-100 tabular-nums">{measuredFps || '—'}</div>
        </div>
      </div>
      <p className="text-[11px] text-mist-400">{label || 'Camera mặc định'}</p>

      <DefectVerdict
        defects={DEFECTS}
        onSubmit={(found, note) => {
          const metrics: Record<string, string | number> = {
            'Camera': label || 'mặc định',
            'Độ phân giải': resolution || '—',
            'FPS đo thật': measuredFps || '—',
            'Lỗi ghi nhận': found.map((f) => f.label).join(', ') || 'không có'
          }
          if (note) metrics['Ghi chú'] = note
          if (found.some((f) => f.severe)) {
            onFinish('failed', found.map((f) => f.label).join(', '), metrics)
          } else if (found.length > 0) {
            onFinish('warning', found.map((f) => f.label).join(', '), metrics)
          } else {
            onFinish('passed', `Camera lên hình ${resolution}, ${measuredFps || declaredFps} FPS`, metrics)
          }
        }}
      />

      <div className="flex justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}
