import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui'
import { DefectVerdict, Instruction, MediaFailurePanel, mediaFailure, type MediaFailure } from './shared'
import type { TestPanelProps } from './types'

const DEFECTS = [
  { id: 'silent', label: 'Không thu được tiếng', severe: true },
  { id: 'distorted', label: 'Tiếng méo, rè', severe: true },
  { id: 'noise', label: 'Ù nền, nhiễu lớn' },
  { id: 'low', label: 'Mức thu yếu, phải nói sát mới nghe' },
  { id: 'intermittent', label: 'Lúc được lúc mất' }
]

const RECORD_MS = 5000

export default function MicrophoneTest({ onFinish, onClose }: TestPanelProps) {
  const [failure, setFailure] = useState<MediaFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [level, setLevel] = useState(0)
  const [peak, setPeak] = useState(0)
  const [deviceLabel, setDeviceLabel] = useState('')
  const [sampleRate, setSampleRate] = useState(0)
  const [recording, setRecording] = useState(false)
  const [clipUrl, setClipUrl] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    let raf = 0
    let cancelled = false

    async function start(): Promise<void> {
      setFailure(null)
      try {
        // Tắt xử lý hậu kỳ để nghe đúng chất lượng micro phần cứng
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setDeviceLabel(stream.getAudioTracks()[0]?.label ?? '')

        const ctx = new AudioContext()
        ctxRef.current = ctx
        setSampleRate(ctx.sampleRate)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        ctx.createMediaStreamSource(stream).connect(analyser)

        const buffer = new Float32Array(analyser.fftSize)
        const tick = (): void => {
          analyser.getFloatTimeDomainData(buffer)
          let sum = 0
          for (const sample of buffer) sum += sample * sample
          const rms = Math.sqrt(sum / buffer.length)
          const db = 20 * Math.log10(Math.max(rms, 1e-8))
          const normalized = Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
          setLevel(normalized)
          setPeak((prev) => Math.max(prev, normalized))
          raf = requestAnimationFrame(tick)
        }
        tick()
      } catch (err) {
        setFailure(mediaFailure(err, 'micro'))
      }
    }
    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      recorderRef.current?.state === 'recording' && recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      void ctxRef.current?.close()
    }
    // attempt tang len khi bam "Thu lai" -> chay lai toan bo quy trinh mo micro
  }, [attempt])

  function record(): void {
    const stream = streamRef.current
    if (!stream) return
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.onstop = () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl)
      setClipUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })))
      setRecording(false)
    }
    recorder.start()
    setRecording(true)
    window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), RECORD_MS)
  }

  if (failure) {
    return (
      <MediaFailurePanel
        failure={failure}
        onRetry={() => setAttempt((n) => n + 1)}
        onClose={onClose}
        onFail={() => onFinish('failed', failure.message)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Nói bình thường cách máy khoảng 40 cm. Cột mức phải nhảy theo giọng. Sau đó ghi 5 giây và
        nghe lại — micro hỏng thường thu được nhưng tiếng bị rè hoặc chỉ có tiếng ù.
      </Instruction>

      <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="mb-2 flex justify-between text-xs text-mist-400">
          <span>{deviceLabel || 'Micro mặc định'}</span>
          <span>{sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : ''}</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-ink-850">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-[width] duration-75"
            style={{ width: `${level}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-mist-400">
          <span>Mức hiện tại {level.toFixed(0)}%</span>
          <span>Đỉnh đã đạt {peak.toFixed(0)}%</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant={recording ? 'danger' : 'primary'} onClick={record} disabled={recording}>
          {recording ? <Square size={14} /> : <Mic size={14} />}
          {recording ? 'Đang ghi 5 giây…' : 'Ghi thử 5 giây'}
        </Button>
        {clipUrl && <audio src={clipUrl} controls className="h-9 flex-1" />}
      </div>

      <DefectVerdict
        defects={DEFECTS}
        onSubmit={(found, note) => {
          const metrics: Record<string, string | number> = {
            'Thiết bị': deviceLabel || 'mặc định',
            'Đỉnh mức thu': `${peak.toFixed(0)}%`,
            'Đã ghi thử': clipUrl ? 'có' : 'chưa',
            'Lỗi ghi nhận': found.map((f) => f.label).join(', ') || 'không có'
          }
          if (note) metrics['Ghi chú'] = note
          if (found.some((f) => f.severe)) {
            onFinish('failed', found.map((f) => f.label).join(', '), metrics)
          } else if (found.length > 0) {
            onFinish('warning', found.map((f) => f.label).join(', '), metrics)
          } else if (peak < 20) {
            onFinish('warning', `Mức thu đỉnh chỉ ${peak.toFixed(0)}% — cần kiểm tra lại`, metrics)
          } else {
            onFinish('passed', `Micro thu tốt, đỉnh ${peak.toFixed(0)}%`, metrics)
          }
        }}
      />

      <div className="flex justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}
