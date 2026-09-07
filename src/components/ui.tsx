import type { ReactNode } from 'react'
import type { FindingSeverity, TestStatus } from '@shared/types'

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = ''
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl border border-ink-700/70 bg-ink-900/70 backdrop-blur-sm ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-700/60 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-mist-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function InfoTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={i} className="border-b border-ink-800/70 last:border-0">
            <th className="w-[46%] py-1.5 pr-3 text-left align-top text-xs font-normal text-mist-400">
              {label}
            </th>
            <td className="py-1.5 align-top text-slate-100 tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const BUTTON_VARIANTS = {
  primary: 'bg-accent-600 text-white hover:bg-accent-500 disabled:bg-ink-700 disabled:text-mist-400',
  ghost: 'border border-ink-600 text-slate-200 hover:border-accent-600 hover:text-white disabled:opacity-40',
  danger: 'bg-rose-600/90 text-white hover:bg-rose-500 disabled:opacity-40',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40'
} as const

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  size = 'md',
  className = '',
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: keyof typeof BUTTON_VARIANTS
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`no-drag inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
      } ${BUTTON_VARIANTS[variant]} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {children}
    </button>
  )
}

export const STATUS_STYLE: Record<TestStatus, { label: string; className: string }> = {
  pending: { label: 'Chưa chạy', className: 'bg-ink-700/60 text-mist-300 border-ink-600' },
  running: { label: 'Đang chạy', className: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  passed: { label: 'Đạt', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  warning: { label: 'Lưu ý', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  failed: { label: 'Lỗi', className: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  skipped: { label: 'Bỏ qua', className: 'bg-ink-700/60 text-mist-400 border-ink-600' }
}

export function StatusBadge({ status }: { status: TestStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.className}`}>
      {s.label}
    </span>
  )
}

export const SEVERITY_STYLE: Record<
  FindingSeverity,
  { label: string; text: string; border: string; bg: string }
> = {
  critical: { label: 'Nghiêm trọng', text: 'text-rose-300', border: 'border-rose-500/50', bg: 'bg-rose-500/10' },
  major: { label: 'Đáng kể', text: 'text-orange-300', border: 'border-orange-500/50', bg: 'bg-orange-500/10' },
  minor: { label: 'Nhẹ', text: 'text-amber-300', border: 'border-amber-500/40', bg: 'bg-amber-500/10' },
  info: { label: 'Thông tin', text: 'text-sky-300', border: 'border-sky-500/40', bg: 'bg-sky-500/10' }
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral'
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneClass = {
    neutral: 'text-slate-100',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-rose-300'
  }[tone]
  return (
    <div className="rounded-lg border border-ink-700/70 bg-ink-850/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-mist-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-mist-400">{hint}</div>}
    </div>
  )
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-mist-300">
          <span>{label}</span>
          <span className="tabular-nums">{clamped.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 py-12 text-center">
      <p className="text-sm text-mist-300">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs text-mist-400">{hint}</p>}
    </div>
  )
}

export function Field({
  label,
  children,
  hint
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mist-400">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-ink-600 focus:border-accent-600'

/**
 * Biểu đồ nhiệt độ và tải CPU theo thời gian.
 * Vẽ bằng SVG thuần để không phải kéo thêm thư viện chart.
 */
export function SensorChart({
  data,
  height = 140
}: {
  data: { cpuLoadPercent: number; cpuTempC: number | null }[]
  height?: number
}) {
  const width = 640
  const maxTemp = 110
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-ink-700 bg-ink-950 text-xs text-mist-400"
        style={{ height }}
      >
        Đang chờ dữ liệu cảm biến…
      </div>
    )
  }

  const stepX = width / (data.length - 1)
  const toPath = (pick: (d: (typeof data)[number]) => number | null, max: number): string =>
    data
      .map((d, i) => {
        const value = pick(d)
        if (value === null) return null
        return `${i * stepX},${height - (Math.min(value, max) / max) * height}`
      })
      .filter((point): point is string => point !== null)
      .join(' ')

  const tempPath = toPath((d) => d.cpuTempC, maxTemp)
  const loadPath = toPath((d) => d.cpuLoadPercent, 100)

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={0}
            x2={width}
            y1={height * r}
            y2={height * r}
            stroke="#1f2c4a"
            strokeWidth={1}
          />
        ))}
        {loadPath && (
          <polyline points={loadPath} fill="none" stroke="#38bdf8" strokeWidth={1.5} opacity={0.55} />
        )}
        {tempPath && <polyline points={tempPath} fill="none" stroke="#fb7185" strokeWidth={2} />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-mist-400">
        <span className="text-rose-300">Nhiệt độ CPU (0–110 °C)</span>
        <span className="text-accent-500">Tải CPU (0–100%)</span>
      </div>
    </div>
  )
}

/** Hộp thoại phủ toàn ứng dụng, dùng cho từng bài test. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm">
      <div
        className={`w-full rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl ${
          wide ? 'max-w-5xl' : 'max-w-3xl'
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-mist-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-mist-400 transition-colors hover:bg-ink-800 hover:text-white"
          >
            ✕
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export const GRADE_TONE: Record<string, string> = {
  'A+': 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
  A: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
  B: 'text-sky-300 border-sky-500/50 bg-sky-500/10',
  C: 'text-amber-300 border-amber-500/50 bg-amber-500/10',
  D: 'text-orange-300 border-orange-500/50 bg-orange-500/10',
  F: 'text-rose-300 border-rose-500/50 bg-rose-500/10'
}
