import { useEffect, useMemo, useState } from 'react'
import { Button, Field, inputClass } from '@/components/ui'
import { Instruction } from './shared'
import type { TestPanelProps } from './types'
import { useAppStore } from '@/store/useAppStore'

interface KeyDef {
  code: string
  label: string
  /** Bề rộng theo đơn vị phím (1 = phím chữ) */
  w?: number
}

const k = (code: string, label: string, w?: number): KeyDef => ({ code, label, w })

const MAIN_ROWS: KeyDef[][] = [
  [
    k('Escape', 'Esc', 1.4),
    k('F1', 'F1'), k('F2', 'F2'), k('F3', 'F3'), k('F4', 'F4'),
    k('F5', 'F5'), k('F6', 'F6'), k('F7', 'F7'), k('F8', 'F8'),
    k('F9', 'F9'), k('F10', 'F10'), k('F11', 'F11'), k('F12', 'F12'),
    k('Delete', 'Del', 1.4)
  ],
  [
    k('Backquote', '`'), k('Digit1', '1'), k('Digit2', '2'), k('Digit3', '3'),
    k('Digit4', '4'), k('Digit5', '5'), k('Digit6', '6'), k('Digit7', '7'),
    k('Digit8', '8'), k('Digit9', '9'), k('Digit0', '0'),
    k('Minus', '-'), k('Equal', '='), k('Backspace', 'Backspace', 2)
  ],
  [
    k('Tab', 'Tab', 1.5),
    k('KeyQ', 'Q'), k('KeyW', 'W'), k('KeyE', 'E'), k('KeyR', 'R'), k('KeyT', 'T'),
    k('KeyY', 'Y'), k('KeyU', 'U'), k('KeyI', 'I'), k('KeyO', 'O'), k('KeyP', 'P'),
    k('BracketLeft', '['), k('BracketRight', ']'), k('Backslash', '\\', 1.5)
  ],
  [
    k('CapsLock', 'Caps', 1.8),
    k('KeyA', 'A'), k('KeyS', 'S'), k('KeyD', 'D'), k('KeyF', 'F'), k('KeyG', 'G'),
    k('KeyH', 'H'), k('KeyJ', 'J'), k('KeyK', 'K'), k('KeyL', 'L'),
    k('Semicolon', ';'), k('Quote', "'"), k('Enter', 'Enter', 2.2)
  ],
  [
    k('ShiftLeft', 'Shift', 2.4),
    k('KeyZ', 'Z'), k('KeyX', 'X'), k('KeyC', 'C'), k('KeyV', 'V'), k('KeyB', 'B'),
    k('KeyN', 'N'), k('KeyM', 'M'),
    k('Comma', ','), k('Period', '.'), k('Slash', '/'), k('ShiftRight', 'Shift', 2.6)
  ]
]

/** Hàng cuối khác nhau giữa Windows và macOS nên tách riêng. */
function bottomRow(isMac: boolean): KeyDef[] {
  return isMac
    ? [
        k('ControlLeft', 'ctrl', 1.2), k('AltLeft', '⌥', 1.2), k('MetaLeft', '⌘', 1.4),
        k('Space', 'Space', 5.4),
        k('MetaRight', '⌘', 1.4), k('AltRight', '⌥', 1.2),
        k('ArrowLeft', '←'), k('ArrowUp', '↑'), k('ArrowDown', '↓'), k('ArrowRight', '→')
      ]
    : [
        k('ControlLeft', 'Ctrl', 1.4), k('MetaLeft', 'Win', 1.2), k('AltLeft', 'Alt', 1.2),
        k('Space', 'Space', 5.4),
        k('AltRight', 'Alt', 1.2), k('ControlRight', 'Ctrl', 1.4),
        k('ArrowLeft', '←'), k('ArrowUp', '↑'), k('ArrowDown', '↓'), k('ArrowRight', '→')
      ]
}

const NUMPAD_ROWS: KeyDef[][] = [
  [k('NumLock', 'Num'), k('NumpadDivide', '/'), k('NumpadMultiply', '*'), k('NumpadSubtract', '-')],
  [k('Numpad7', '7'), k('Numpad8', '8'), k('Numpad9', '9'), k('NumpadAdd', '+')],
  [k('Numpad4', '4'), k('Numpad5', '5'), k('Numpad6', '6')],
  [k('Numpad1', '1'), k('Numpad2', '2'), k('Numpad3', '3'), k('NumpadEnter', '⏎')],
  [k('Numpad0', '0', 2), k('NumpadDecimal', '.')]
]

const UNIT_PX = 40

export default function KeyboardTest({ onFinish, onClose }: TestPanelProps) {
  const platform = useAppStore((s) => s.appInfo?.platform)
  const isMac = platform === 'darwin'
  const [hasNumpad, setHasNumpad] = useState(false)
  const [pressed, setPressed] = useState<Set<string>>(new Set())
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [repeats, setRepeats] = useState<Record<string, number>>({})
  const [unknown, setUnknown] = useState<string[]>([])
  const [note, setNote] = useState('')

  const rows = useMemo(() => [...MAIN_ROWS, bottomRow(isMac)], [isMac])
  const layoutCodes = useMemo(() => {
    const codes = rows.flat().map((key) => key.code)
    if (hasNumpad) codes.push(...NUMPAD_ROWS.flat().map((key) => key.code))
    return new Set(codes)
  }, [rows, hasNumpad])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      const code = e.code
      // Bàn phím ảo hoặc IME có thể gửi sự kiện không kèm mã phím
      if (!code) return
      // Phím tự lặp khi giữ không tính là nhấn nhiều lần
      if (e.repeat) return
      setRepeats((prev) => ({ ...prev, [code]: (prev[code] ?? 0) + 1 }))
      setPressed((prev) => (prev.has(code) ? prev : new Set(prev).add(code)))
      if (!layoutCodes.has(code)) {
        setUnknown((prev) => (prev.includes(code) ? prev : [...prev, code]))
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => e.preventDefault()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [layoutCodes])

  /** Doi ma phim (KeyW) sang nhan in tren phim (W) cho de doc. */
  function labelOf(code: string): string {
    const key = [...rows.flat(), ...NUMPAD_ROWS.flat()].find((item) => item.code === code)
    return key ? key.label : code
  }

  const total = layoutCodes.size
  const hit = [...pressed].filter((code) => layoutCodes.has(code)).length
  const missing = [...layoutCodes].filter((code) => !pressed.has(code))

  function toggleBad(code: string): void {
    setBad((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function keyClass(code: string): string {
    if (bad.has(code)) return 'bg-rose-600 text-white border-rose-400'
    if (pressed.has(code)) return 'bg-emerald-600/80 text-white border-emerald-400/60'
    return 'bg-ink-850 text-mist-300 border-ink-600'
  }

  function renderKey(key: KeyDef, index: number) {
    return (
      <button
        key={`${key.code}-${index}`}
        onClick={() => toggleBad(key.code)}
        title={`${key.code} — bấm chuột để đánh dấu phím lỗi`}
        style={{ width: (key.w ?? 1) * UNIT_PX }}
        className={`h-9 shrink-0 rounded-md border text-[11px] font-medium transition-colors ${keyClass(key.code)}`}
      >
        {key.label}
      </button>
    )
  }

  function conclude(): void {
    const badList = [...bad].map(labelOf).join(', ')
    const metrics: Record<string, string | number> = {
      'Phím nhận tín hiệu': `${hit}/${total}`,
      'Phím lỗi': badList || 'không có',
      'Bàn phím số': hasNumpad ? 'có' : 'không'
    }
    if (note.trim()) metrics['Ghi chú'] = note.trim()

    if (bad.size > 0) {
      onFinish('failed', `${bad.size} phím lỗi: ${badList}`, metrics)
    } else if (missing.length > 0) {
      onFinish(
        'warning',
        `Còn ${missing.length} phím chưa bấm thử (${missing.slice(0, 6).map(labelOf).join(', ')}${missing.length > 6 ? '…' : ''})`,
        metrics
      )
    } else {
      onFinish('passed', `Toàn bộ ${total} phím nhận tín hiệu bình thường`, metrics)
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Bấm lần lượt từng phím — phím nhận tín hiệu sẽ chuyển xanh. Nếu một phím bị liệt hoặc phải
        nhấn mạnh mới ăn, hãy <strong>bấm chuột vào phím đó</strong> để đánh dấu đỏ. Cột "số lần
        nhận" giúp phát hiện phím nhảy đúp (một lần bấm nhận 2 ký tự).
      </Instruction>

      <div className="flex flex-wrap items-center gap-4 text-xs text-mist-300">
        <span>
          Đã nhận <strong className="text-emerald-300">{hit}</strong>/{total}
        </span>
        <span>
          Đánh dấu lỗi <strong className="text-rose-300">{bad.size}</strong>
        </span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hasNumpad}
            onChange={(e) => setHasNumpad(e.target.checked)}
            className="accent-sky-500"
          />
          Máy có bàn phím số
        </label>
        <button
          onClick={() => {
            setPressed(new Set())
            setBad(new Set())
            setRepeats({})
            setUnknown([])
          }}
          className="text-accent-500 hover:underline"
        >
          Làm lại
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-3">
        <div className="space-y-1">
          {rows.map((row, r) => (
            <div key={r} className="flex gap-1">
              {row.map(renderKey)}
            </div>
          ))}
        </div>
        {hasNumpad && (
          <div className="space-y-1 border-l border-ink-700 pl-3">
            {NUMPAD_ROWS.map((row, r) => (
              <div key={r} className="flex gap-1">
                {row.map(renderKey)}
              </div>
            ))}
          </div>
        )}
      </div>

      {unknown.length > 0 && (
        <p className="text-xs text-mist-400">
          Phím ngoài sơ đồ đã nhận: <span className="text-slate-200">{unknown.join(', ')}</span>
        </p>
      )}

      {Object.entries(repeats).filter(([, n]) => n >= 2).length > 0 && (
        <details className="text-xs text-mist-400">
          <summary className="cursor-pointer">Số lần nhận của từng phím</summary>
          <div className="mt-1 flex flex-wrap gap-2">
            {Object.entries(repeats)
              .sort((a, b) => b[1] - a[1])
              .map(([code, n]) => (
                <span key={code} className="rounded bg-ink-800 px-1.5 py-0.5">
                  {code}: {n}
                </span>
              ))}
          </div>
        </details>
      )}

      <Field label="Ghi chú thêm">
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: phím Space kêu to, keycap W bị mòn chữ"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude}>
          Kết luận bàn phím
        </Button>
      </div>
    </div>
  )
}
