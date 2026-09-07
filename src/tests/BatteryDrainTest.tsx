import { useEffect, useRef, useState } from 'react'
import { BatteryCharging, Play, StopCircle } from 'lucide-react'
import type { SensorSnapshot } from '@shared/types'
import { Button, ProgressBar, StatTile } from '@/components/ui'
import { Instruction } from './shared'
import { useAppStore } from '@/store/useAppStore'
import type { TestPanelProps } from './types'

const SAMPLE_MS = 15000

const DURATIONS = [
  { min: 10, label: '10 phút' },
  { min: 20, label: '20 phút' },
  { min: 30, label: '30 phút — chính xác nhất' }
]

interface Sample {
  t: number
  percent: number
  powerW: number | null
}

export default function BatteryDrainTest({ onFinish, onClose }: TestPanelProps) {
  const battery = useAppStore((s) => s.profile?.battery)
  const [targetMin, setTargetMin] = useState(20)
  const [running, setRunning] = useState(false)
  const [samples, setSamples] = useState<Sample[]>([])
  const [acWarning, setAcWarning] = useState(false)
  const [error, setError] = useState('')
  const startedAt = useRef(0)

  useEffect(() => {
    if (!running) return
    let cancelled = false

    async function sample(): Promise<void> {
      try {
        const snapshot: SensorSnapshot = await window.lapcheck.getSensorSnapshot()
        if (cancelled || snapshot.batteryPercent === null) return
        setSamples((prev) => [
          ...prev,
          { t: Date.now(), percent: snapshot.batteryPercent as number, powerW: snapshot.powerW }
        ])
        // Sạc đang cắm thì công suất dương -> không đo được tốc độ xả
        if (snapshot.powerW !== null && snapshot.powerW > 0) setAcWarning(true)
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void sample()
    const timer = window.setInterval(() => void sample(), SAMPLE_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [running])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt.current >= targetMin * 60_000) setRunning(false)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, targetMin])

  const first = samples[0]
  const last = samples[samples.length - 1]
  const elapsedMin = first && last ? (last.t - first.t) / 60_000 : 0
  const dropped = first && last ? first.percent - last.percent : 0
  const drainPerHour = elapsedMin > 0 ? (dropped / elapsedMin) * 60 : 0
  const estimatedHours = drainPerHour > 0 ? 100 / drainPerHour : null

  const powerSamples = samples.map((s) => s.powerW).filter((w): w is number => w !== null && w < 0)
  const avgWatt =
    powerSamples.length > 0
      ? Math.abs(powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length)
      : null
  const capacityWh = battery?.maxCapacityMWh ? battery.maxCapacityMWh / 1000 : null
  const hoursByPower = avgWatt && capacityWh ? capacityWh / avgWatt : null

  const progressPercent = Math.min(100, (elapsedMin / targetMin) * 100)

  function conclude(): void {
    const metrics: Record<string, string | number> = {
      'Thời gian theo dõi': `${elapsedMin.toFixed(0)} phút`,
      'Pin tụt': `${dropped.toFixed(0)}%`,
      'Tốc độ xả': `${drainPerHour.toFixed(1)} %/giờ`,
      'Ước lượng dùng được': estimatedHours ? `${estimatedHours.toFixed(1)} giờ` : 'chưa đủ dữ liệu',
      'Công suất tiêu thụ': avgWatt ? `${avgWatt.toFixed(1)} W` : 'không đọc được',
      'Độ chai pin': battery?.wearPercent !== null && battery?.wearPercent !== undefined
        ? `${battery.wearPercent.toFixed(0)}%`
        : '—',
      'Chu kỳ sạc': battery?.cycleCount ?? '—'
    }

    if (acWarning || dropped <= 0) {
      onFinish('warning', 'Máy vẫn cắm sạc hoặc pin không tụt — chưa đo được tốc độ xả thật', metrics)
    } else if (elapsedMin < 5) {
      onFinish('warning', `Mới theo dõi ${elapsedMin.toFixed(0)} phút, số liệu chưa đáng tin`, metrics)
    } else if (estimatedHours !== null && estimatedHours < 1.5) {
      onFinish('failed', `Chỉ dùng được khoảng ${estimatedHours.toFixed(1)} giờ — pin chai nặng`, metrics)
    } else if (estimatedHours !== null && estimatedHours < 3) {
      onFinish('warning', `Ước lượng ${estimatedHours.toFixed(1)} giờ sử dụng — pin đã yếu`, metrics)
    } else {
      onFinish('passed', `Ước lượng ${estimatedHours?.toFixed(1)} giờ sử dụng ở tải nhẹ`, metrics)
    }
  }

  if (!battery?.hasBattery) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-mist-300">Máy này không có pin nên bỏ qua hạng mục.</p>
        <div className="flex justify-end">
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Instruction>
        <strong>Rút sạc trước khi bắt đầu.</strong> Phần mềm theo dõi tốc độ tụt pin thực tế ở mức
        tải hiện tại rồi quy ra thời lượng dùng được — con số này đáng tin hơn nhiều so với dung
        lượng danh nghĩa. Giữ độ sáng màn hình khoảng 50% và không chạy tác vụ nặng trong lúc đo.
      </Instruction>

      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Pin hiện tại" value={last ? `${last.percent.toFixed(0)}%` : '—'} />
        <StatTile
          label="Độ chai"
          value={battery.wearPercent !== null ? `${battery.wearPercent.toFixed(0)}%` : '—'}
          tone={
            battery.wearPercent === null ? 'neutral' : battery.wearPercent >= 20 ? 'bad' : battery.wearPercent >= 10 ? 'warn' : 'good'
          }
        />
        <StatTile label="Chu kỳ sạc" value={battery.cycleCount ?? '—'} />
        <StatTile
          label="Dung lượng còn"
          value={capacityWh ? `${capacityWh.toFixed(1)} Wh` : '—'}
          hint={battery.designedCapacityMWh ? `thiết kế ${(battery.designedCapacityMWh / 1000).toFixed(1)} Wh` : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d.min}
              onClick={() => setTargetMin(d.min)}
              disabled={running}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                targetMin === d.min
                  ? 'border-accent-600 bg-accent-600/20 text-accent-500'
                  : 'border-ink-600 text-mist-300 hover:text-slate-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {running ? (
          <Button variant="danger" onClick={() => setRunning(false)}>
            <StopCircle size={14} />
            Dừng theo dõi
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              setSamples([])
              setAcWarning(false)
              startedAt.current = Date.now()
              setRunning(true)
            }}
          >
            <Play size={14} />
            Bắt đầu đo xả pin
          </Button>
        )}
      </div>

      {running && (
        <ProgressBar
          percent={progressPercent}
          label={`Đã theo dõi ${elapsedMin.toFixed(0)}/${targetMin} phút · ${samples.length} mẫu`}
        />
      )}

      {acWarning && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <BatteryCharging size={16} />
          Máy đang cắm sạc — hãy rút sạc rồi đo lại.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {samples.length > 1 && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Tốc độ xả" value={`${drainPerHour.toFixed(1)}`} hint="%/giờ" />
          <StatTile
            label="Ước lượng dùng được"
            value={estimatedHours ? `${estimatedHours.toFixed(1)} giờ` : '—'}
            tone={
              estimatedHours === null ? 'neutral' : estimatedHours < 1.5 ? 'bad' : estimatedHours < 3 ? 'warn' : 'good'
            }
            hint={hoursByPower ? `theo công suất: ${hoursByPower.toFixed(1)} giờ` : undefined}
          />
          <StatTile label="Công suất" value={avgWatt ? `${avgWatt.toFixed(1)} W` : '—'} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude} disabled={samples.length < 2}>
          Ghi kết quả
        </Button>
      </div>
    </div>
  )
}
