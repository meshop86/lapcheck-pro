import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Lớp phủ toàn màn hình cho các bài test màn hình.
 * Nhấn Escape để thoát, tự yêu cầu fullscreen thật để che cả thanh tác vụ.
 */
export function FullscreenLayer({
  children,
  onExit,
  background = '#000'
}: {
  children: ReactNode
  onExit: () => void
  background?: string
}) {
  useEffect(() => {
    const el = document.documentElement
    void el.requestFullscreen?.().catch(() => undefined)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [onExit])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background }}>
      {children}
      <button
        onClick={onExit}
        className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white/70 backdrop-blur transition-colors hover:text-white"
        title="Thoát (Esc)"
      >
        <X size={18} />
      </button>
    </div>
  )
}

/** Bảng hướng dẫn nổi trên nền test, tự mờ đi để không che khuyết điểm màn hình. */
export function FloatingHint({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-black/60 px-4 py-2 text-center text-sm text-white/80 opacity-70 backdrop-blur transition-opacity hover:opacity-100">
      {children}
    </div>
  )
}

export function Instruction({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-accent-600/30 bg-accent-600/10 px-3 py-2 text-xs leading-relaxed text-mist-300">
      {children}
    </div>
  )
}

/**
 * Bảng kết luận dùng chung: kỹ thuật viên tick các lỗi quan sát được.
 * Không tick lỗi nào = Đạt; tick lỗi nặng = Lỗi; còn lại = Lưu ý.
 */
export function DefectVerdict({
  defects,
  onSubmit
}: {
  defects: { id: string; label: string; severe?: boolean }[]
  onSubmit: (found: { id: string; label: string; severe?: boolean }[], note: string) => void
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  const toggle = (id: string): void =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {defects.map((d) => (
          <label
            key={d.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              checked.has(d.id)
                ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
                : 'border-ink-700 bg-ink-850 text-mist-300'
            }`}
          >
            <input
              type="checkbox"
              checked={checked.has(d.id)}
              onChange={() => toggle(d.id)}
              className="accent-rose-500"
            />
            {d.label}
          </label>
        ))}
      </div>
      <input
        className="w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-ink-600 focus:border-accent-600"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Mô tả chi tiết vị trí, mức độ lỗi"
      />
      <div className="flex justify-end">
        <button
          onClick={() => onSubmit(defects.filter((d) => checked.has(d.id)), note.trim())}
          className="no-drag rounded-lg bg-accent-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-500"
        >
          Ghi kết luận
        </button>
      </div>
    </div>
  )
}

/** Kết quả phân loại lỗi khi mở micro/webcam. */
export interface MediaFailure {
  message: string
  /** true = dấu hiệu hỏng phần cứng; false = vướng quyền hoặc app khác đang chiếm thiết bị */
  hardware: boolean
}

/**
 * Dịch lỗi getUserMedia sang câu tiếng Việt và nói rõ có được kết luận hỏng hay chưa.
 * Trình duyệt trả tên lỗi chuẩn hoá, thông báo gốc thì bằng tiếng Anh và khó hiểu.
 */
export function mediaFailure(err: unknown, device: string): MediaFailure {
  const name = (err as DOMException)?.name ?? ''
  const raw = (err as Error)?.message ?? String(err)
  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        message: `Hệ thống không thấy ${device} nào. Nếu máy vốn có ${device}, khả năng cao là hỏng, đứt cáp hoặc bị tắt trong BIOS.`,
        hardware: true
      }
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        message: `Hệ điều hành đang chặn quyền truy cập ${device}. Cấp quyền cho ứng dụng rồi thử lại — chưa đủ căn cứ kết luận hỏng.`,
        hardware: false
      }
    case 'NotReadableError':
    case 'AbortError':
      return {
        message: `Không đọc được ${device}: thiết bị đang bị ứng dụng khác chiếm hoặc driver lỗi. Đóng các ứng dụng gọi video/ghi âm rồi thử lại.`,
        hardware: false
      }
    default:
      return { message: `Không mở được ${device}: ${raw}`, hardware: false }
  }
}

/** Màn hình lỗi dùng chung cho micro và webcam: giải thích, thử lại, hoặc ghi nhận hỏng. */
export function MediaFailurePanel({
  failure,
  hint,
  onRetry,
  onClose,
  onFail
}: {
  failure: MediaFailure
  hint?: ReactNode
  onRetry: () => void
  onClose: () => void
  onFail: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        {failure.message}
      </p>
      {hint && <p className="text-xs text-mist-400">{hint}</p>}
      {!failure.hardware && (
        <p className="text-xs text-amber-300/80">
          Chỉ ghi nhận là lỗi sau khi đã xử lý nguyên nhân trên mà vẫn không mở được thiết bị.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={onRetry}>
          Thử lại
        </Button>
        <Button variant="danger" onClick={onFail}>
          Ghi nhận là lỗi
        </Button>
      </div>
    </div>
  )
}
