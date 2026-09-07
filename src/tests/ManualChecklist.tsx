import { useState } from 'react'
import { Button, Field, inputClass } from '@/components/ui'
import { Instruction } from './shared'
import type { TestPanelProps } from './types'

type Verdict = 'ok' | 'minor' | 'bad' | 'na' | null

interface ChecklistItem {
  id: string
  label: string
  hint?: string
}

const VERDICT_OPTIONS: { id: Exclude<Verdict, null>; label: string; className: string }[] = [
  { id: 'ok', label: 'Tốt', className: 'bg-emerald-600 text-white border-emerald-500' },
  { id: 'minor', label: 'Nhẹ', className: 'bg-amber-500 text-ink-950 border-amber-400' },
  { id: 'bad', label: 'Lỗi', className: 'bg-rose-600 text-white border-rose-500' },
  { id: 'na', label: 'Không có', className: 'bg-ink-700 text-mist-300 border-ink-600' }
]

function Checklist({
  items,
  intro,
  passSummary,
  onFinish,
  onClose
}: TestPanelProps & { items: ChecklistItem[]; intro: string; passSummary: string }) {
  const [state, setState] = useState<Record<string, Verdict>>({})
  const [note, setNote] = useState('')

  const rated = items.filter((i) => state[i.id])
  const bad = items.filter((i) => state[i.id] === 'bad')
  const minor = items.filter((i) => state[i.id] === 'minor')
  const untouched = items.filter((i) => !state[i.id])

  function conclude(): void {
    const metrics: Record<string, string | number> = {
      'Hạng mục đã chấm': `${rated.length}/${items.length}`,
      'Lỗi nặng': bad.map((i) => i.label).join(', ') || 'không có',
      'Lỗi nhẹ': minor.map((i) => i.label).join(', ') || 'không có'
    }
    if (note.trim()) metrics['Ghi chú'] = note.trim()

    if (bad.length > 0) {
      onFinish('failed', `Lỗi nặng: ${bad.map((i) => i.label).join(', ')}`, metrics)
    } else if (minor.length > 0) {
      onFinish('warning', `Có ${minor.length} hạng mục lỗi nhẹ`, metrics)
    } else if (untouched.length > 0) {
      onFinish('warning', `Còn ${untouched.length} hạng mục chưa chấm`, metrics)
    } else {
      onFinish('passed', passSummary, metrics)
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>{intro}</Instruction>

      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2"
          >
            <div className="flex-1">
              <div className="text-sm text-slate-100">{item.label}</div>
              {item.hint && <div className="text-[11px] text-mist-400">{item.hint}</div>}
            </div>
            <div className="flex gap-1">
              {VERDICT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setState((prev) => ({ ...prev, [item.id]: option.id }))}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    state[item.id] === option.id
                      ? option.className
                      : 'border-ink-600 bg-ink-900 text-mist-400 hover:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Field label="Ghi chú chi tiết">
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Mô tả vị trí và mức độ, ví dụ: móp góc trái dưới 3 mm"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={conclude}>
          Kết luận ({rated.length}/{items.length})
        </Button>
      </div>
    </div>
  )
}

const PORT_ITEMS: ChecklistItem[] = [
  { id: 'usb-a-left', label: 'USB-A cạnh trái', hint: 'Cắm chuột/USB, kiểm tra nhận và độ chắc' },
  { id: 'usb-a-right', label: 'USB-A cạnh phải' },
  { id: 'usb-c', label: 'USB-C / Thunderbolt', hint: 'Thử truyền dữ liệu và xuất hình nếu hỗ trợ' },
  { id: 'hdmi', label: 'HDMI / DisplayPort', hint: 'Cắm màn ngoài, xem có nhiễu hay mất tín hiệu' },
  { id: 'jack', label: 'Jack tai nghe 3.5 mm', hint: 'Nghe cả hai kênh, xoay nhẹ đầu jack xem có rẹt rẹt' },
  { id: 'sd', label: 'Khe thẻ nhớ SD / microSD' },
  { id: 'lan', label: 'Cổng LAN RJ45' },
  { id: 'charge', label: 'Cổng sạc', hint: 'Cắm vào phải chắc, không lỏng, không nóng bất thường' },
  { id: 'wifi', label: 'Wi-Fi', hint: 'Kết nối và mở một trang web' },
  { id: 'bluetooth', label: 'Bluetooth', hint: 'Ghép một thiết bị bất kỳ' },
  { id: 'fingerprint', label: 'Cảm biến vân tay / khuôn mặt' },
  { id: 'backlight', label: 'Đèn nền bàn phím', hint: 'Đủ mức sáng, không có vùng tối' }
]

const PHYSICAL_ITEMS: ChecklistItem[] = [
  { id: 'lid', label: 'Mặt A — nắp lưng màn hình', hint: 'Móp, cong, nứt, tróc sơn' },
  { id: 'bezel', label: 'Mặt B — viền màn hình', hint: 'Hở viền là dấu hiệu màn đã thay' },
  { id: 'deck', label: 'Mặt C — chiếu nghỉ tay', hint: 'Phồng do pin trương, bong lớp phủ' },
  { id: 'bottom', label: 'Mặt D — đáy máy', hint: 'Chân đế cao su còn đủ không' },
  { id: 'hinge', label: 'Bản lề', hint: 'Mở gập nhiều lần, nghe tiếng và độ giữ góc' },
  { id: 'screws', label: 'Ốc vít', hint: 'Ốc toét, thiếu ốc, tem niêm phong rách = máy đã bung' },
  { id: 'vent', label: 'Khe tản nhiệt', hint: 'Bụi đóng dày, lưới rách' },
  { id: 'keycap', label: 'Keycap và mặt phím', hint: 'Mòn chữ, phím lệch, phím thay khác màu' },
  { id: 'screen-surface', label: 'Bề mặt màn hình', hint: 'Xước, bong lớp chống chói, dán lại film' },
  { id: 'label', label: 'Tem nhãn và serial', hint: 'Serial trên máy có khớp phần mềm đọc được không' },
  { id: 'smell', label: 'Mùi và dấu vết nước', hint: 'Mùi khét, gỉ, vết ố = máy từng vào nước' },
  { id: 'adapter', label: 'Sạc kèm theo', hint: 'Đúng công suất, dây không nứt, đầu cắm không lỏng' }
]

export function PortsTest(props: TestPanelProps) {
  return (
    <Checklist
      {...props}
      items={PORT_ITEMS}
      intro="Cắm thử thiết bị thật vào từng cổng. Cổng lỏng hoặc chỉ nhận khi giữ tay là lỗi phần cứng, không phải lỗi driver."
      passSummary="Toàn bộ cổng kết nối hoạt động bình thường"
    />
  )
}

export function PhysicalTest(props: TestPanelProps) {
  return (
    <Checklist
      {...props}
      items={PHYSICAL_ITEMS}
      intro="Soi dưới đèn sáng, nghiêng máy nhiều góc. Ốc toét và tem rách cho biết máy đã từng mở — hỏi rõ lịch sử sửa chữa trước khi định giá."
      passSummary="Ngoại hình nguyên bản, không dấu vết va đập hay bung máy"
    />
  )
}
