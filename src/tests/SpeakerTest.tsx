import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { DefectVerdict, Instruction } from './shared'
import type { TestPanelProps } from './types'

type Channel = 'left' | 'right' | 'both'

const DEFECTS = [
  { id: 'no-sound', label: 'Không ra tiếng', severe: true },
  { id: 'one-channel', label: 'Mất một bên loa', severe: true },
  { id: 'rattle', label: 'Rè, vỡ tiếng khi lên âm lượng', severe: true },
  { id: 'buzz', label: 'Ù nền, tiếng xì' },
  { id: 'weak', label: 'Âm lượng yếu bất thường' },
  { id: 'no-bass', label: 'Mất dải trầm' }
]

const TONES = [
  { hz: 100, label: '100 Hz — trầm, lộ loa rè' },
  { hz: 440, label: '440 Hz — chuẩn nhạc cụ' },
  { hz: 1000, label: '1 kHz — dải trung' },
  { hz: 8000, label: '8 kHz — cao, lộ màng rách' }
]

export default function SpeakerTest({ onFinish, onClose }: TestPanelProps) {
  const ctxRef = useRef<AudioContext | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<number | null>(null)
  const [volume, setVolume] = useState(0.6)
  const [playing, setPlaying] = useState('')
  const [played, setPlayed] = useState<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      stopRef.current?.()
      void ctxRef.current?.close()
    }
  }, [])

  /**
   * Phai cho AudioContext resume xong roi moi dung do thi am thanh.
   * Neu context con 'suspended' thi currentTime dung yen, envelope bi len lich
   * vao qua khu va tieng dau tien khong bao gio phat ra.
   */
  async function context(): Promise<AudioContext> {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    if (ctxRef.current.state !== 'running') await ctxRef.current.resume()
    return ctxRef.current
  }

  /** Dựng chuỗi oscillator → gain → panner và trả về hàm dừng. */
  async function startNode(
    channel: Channel,
    frequencyHz: number
  ): Promise<{ ctx: AudioContext; osc: OscillatorNode; stop: () => void }> {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    stopRef.current?.()
    const ctx = await context()
    const osc = ctx.createOscillator()
    // Dat tan so truoc khi start, neu khong se co mot nhip 440 Hz mac dinh loe ra
    osc.frequency.setValueAtTime(frequencyHz, ctx.currentTime)
    const gain = ctx.createGain()
    const panner = ctx.createStereoPanner()
    panner.pan.value = channel === 'left' ? -1 : channel === 'right' ? 1 : 0
    // Vào/ra êm để không có tiếng "bụp" làm hỏng phán đoán rè
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.05)
    osc.connect(gain).connect(panner).connect(ctx.destination)
    osc.start()

    const stop = (): void => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime)
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
        osc.stop(ctx.currentTime + 0.08)
      } catch {
        /* node đã dừng */
      }
      stopRef.current = null
      setPlaying('')
    }
    stopRef.current = stop
    return { ctx, osc, stop }
  }

  async function playTone(hz: number, channel: Channel, id: string): Promise<void> {
    const { stop } = await startNode(channel, hz)
    setPlaying(id)
    setPlayed((prev) => new Set(prev).add(id))
    timerRef.current = window.setTimeout(stop, 2500)
  }

  async function playSweep(channel: Channel, id: string): Promise<void> {
    const { ctx, osc, stop } = await startNode(channel, 60)
    osc.frequency.exponentialRampToValueAtTime(15000, ctx.currentTime + 6)
    setPlaying(id)
    setPlayed((prev) => new Set(prev).add(id))
    timerRef.current = window.setTimeout(stop, 6200)
  }

  const channelButton = (channel: Channel, label: string) => {
    const id = `sweep-${channel}`
    return (
      <Button
        key={id}
        variant={playing === id ? 'success' : 'ghost'}
        onClick={() => (playing === id ? stopRef.current?.() : void playSweep(channel, id))}
      >
        <Volume2 size={14} />
        {label}
      </Button>
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Bật âm lượng hệ thống khoảng 70%. Nghe từng bên riêng để chắc không bị mất kênh, rồi quét
        dải tần để phát hiện màng loa rách (tiếng rè ở dải cao) hay loa bị hở (rè ở dải trầm).
        Lưu ý: loa laptop hầu như không tái tạo được 100 Hz — nghe rất nhỏ hoặc chỉ thấy rung là
        bình thường, đừng chấm lỗi. Dùng nút quét dải tần để nghe rõ sự khác biệt.
      </Instruction>

      <div className="flex items-center gap-3">
        <span className="text-xs text-mist-300">Âm lượng</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 accent-sky-500"
        />
        <span className="w-10 text-right text-xs tabular-nums text-mist-300">
          {Math.round(volume * 100)}%
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs text-mist-400">Quét dải tần 60 Hz → 15 kHz</p>
        <div className="flex flex-wrap gap-2">
          {channelButton('left', 'Chỉ loa trái')}
          {channelButton('right', 'Chỉ loa phải')}
          {channelButton('both', 'Cả hai loa')}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-mist-400">Tần số cố định (2,5 giây mỗi lần)</p>
        <div className="grid grid-cols-2 gap-2">
          {TONES.map((t) => {
            const id = `tone-${t.hz}`
            return (
              <Button
                key={id}
                variant={playing === id ? 'success' : 'ghost'}
                onClick={() => void playTone(t.hz, 'both', id)}
              >
                {t.label}
              </Button>
            )
          })}
        </div>
      </div>

      <DefectVerdict
        defects={DEFECTS}
        onSubmit={(found, note) => {
          const metrics: Record<string, string | number> = {
            'Bài đã phát': played.size,
            'Lỗi ghi nhận': found.map((f) => f.label).join(', ') || 'không có'
          }
          if (note) metrics['Ghi chú'] = note
          if (found.some((f) => f.severe)) {
            onFinish('failed', found.map((f) => f.label).join(', '), metrics)
          } else if (found.length > 0) {
            onFinish('warning', found.map((f) => f.label).join(', '), metrics)
          } else if (played.size < 3) {
            onFinish('warning', 'Chưa nghe đủ cả hai kênh và dải tần', metrics)
          } else {
            onFinish('passed', 'Hai loa ra tiếng đều, không rè', metrics)
          }
        }}
      />

      <div className="flex justify-end gap-2">
        {playing && (
          <Button
            variant="danger"
            onClick={() => {
              if (timerRef.current !== null) window.clearTimeout(timerRef.current)
              stopRef.current?.()
            }}
          >
            Dừng phát
          </Button>
        )}
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </div>
  )
}
