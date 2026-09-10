import type { SystemProfile, TestCategory, TestResult } from '@shared/types'

export type TestKind = 'interactive' | 'automated' | 'manual'

export interface TestDefinition {
  id: string
  name: string
  category: TestCategory
  kind: TestKind
  /** Vì sao hạng mục này quan trọng với máy cũ */
  purpose: string
  durationHint: string
  /** Ẩn hạng mục nếu máy không có phần cứng tương ứng */
  isAvailable?: (profile: SystemProfile) => boolean
}

export const TEST_CATALOG: TestDefinition[] = [
  {
    id: 'keyboard',
    name: 'Bàn phím',
    category: 'input',
    kind: 'interactive',
    purpose: 'Tìm phím liệt, phím kẹt, phím nhận nhiều lần — lỗi phổ biến nhất ở máy cũ.',
    durationHint: '2–3 phút'
  },
  {
    id: 'touchpad',
    name: 'Touchpad',
    category: 'input',
    kind: 'interactive',
    purpose: 'Kiểm tra vùng chết, đa điểm chạm và hai nút bấm trái phải.',
    durationHint: '1 phút'
  },
  {
    id: 'display-pixel',
    name: 'Điểm chết & màu màn hình',
    category: 'display',
    kind: 'interactive',
    purpose: 'Phủ từng màu toàn màn hình để lộ điểm chết, điểm sáng và ám màu.',
    durationHint: '2 phút'
  },
  {
    id: 'display-uniformity',
    name: 'Hở sáng & độ đồng đều',
    category: 'display',
    kind: 'interactive',
    purpose: 'Xem hở sáng viền màn (backlight bleed) và độ đồng đều của nền xám.',
    durationHint: '1 phút'
  },
  {
    id: 'display-motion',
    name: 'Bóng mờ & nhấp nháy',
    category: 'display',
    kind: 'interactive',
    purpose: 'Phát hiện bóng ma khi chuyển động và hiện tượng nhấp nháy PWM gây mỏi mắt.',
    durationHint: '1 phút'
  },
  {
    id: 'speaker',
    name: 'Loa',
    category: 'audio',
    kind: 'interactive',
    purpose: 'Quét dải tần và tách trái/phải để nghe rè, mất kênh hoặc màng loa rách.',
    durationHint: '2 phút'
  },
  {
    id: 'microphone',
    name: 'Micro',
    category: 'audio',
    kind: 'interactive',
    purpose: 'Đo mức thu và nghe lại bản ghi để chắc micro không bị câm hoặc nhiễu.',
    durationHint: '1 phút'
  },
  {
    id: 'webcam',
    name: 'Webcam',
    category: 'camera',
    kind: 'interactive',
    purpose: 'Xem hình trực tiếp, đo độ phân giải và FPS thực tế.',
    durationHint: '1 phút'
  },
  {
    id: 'disk-health',
    name: 'Sức khỏe ổ cứng (SMART)',
    category: 'storage',
    kind: 'automated',
    purpose:
      'Đọc chỉ số SMART do chính ổ ghi lại: giờ chạy, tuổi thọ ghi, sector hỏng — không thể làm giả bằng cách cài lại máy.',
    durationHint: '30 giây'
  },
  {
    id: 'disk-benchmark',
    name: 'Tốc độ ổ cứng',
    category: 'storage',
    kind: 'automated',
    purpose: 'Đo tốc độ đọc ghi thật để phát hiện ổ giả dung lượng hoặc ổ đã xuống cấp.',
    durationHint: '2–4 phút'
  },
  {
    id: 'memory-test',
    name: 'Kiểm tra RAM',
    category: 'storage',
    kind: 'automated',
    purpose: 'Ghi và đọc lại nhiều mẫu bit để tìm ô nhớ lỗi gây treo máy ngẫu nhiên.',
    durationHint: '2–5 phút'
  },
  {
    id: 'cpu-stress',
    name: 'Stress test CPU & nhiệt độ',
    category: 'thermal',
    kind: 'automated',
    purpose: 'Ép CPU chạy hết tải để lộ máy khô keo tản nhiệt, quạt yếu hoặc tụt xung nặng.',
    durationHint: '5–15 phút'
  },
  {
    id: 'gpu-stress',
    name: 'Stress test GPU',
    category: 'thermal',
    kind: 'automated',
    purpose:
      'Ép card đồ hoạ dựng hình liên tục để lộ card rời yếu, tản nhiệt kém hoặc GPU đã từng bị đào coin.',
    durationHint: '3–10 phút'
  },
  {
    id: 'battery-drain',
    name: 'Đo xả pin thực tế',
    category: 'battery',
    kind: 'automated',
    purpose: 'Theo dõi tốc độ tụt pin để ước lượng thời lượng dùng thật, không tin số liệu quảng cáo.',
    durationHint: '10–30 phút',
    isAvailable: (p) => p.battery.hasBattery
  },
  {
    id: 'ports',
    name: 'Cổng kết nối',
    category: 'connectivity',
    kind: 'manual',
    purpose: 'Cắm thử từng cổng USB, HDMI, jack tai nghe, khe thẻ nhớ.',
    durationHint: '3 phút'
  },
  {
    id: 'physical',
    name: 'Ngoại hình & bản lề',
    category: 'physical',
    kind: 'manual',
    purpose: 'Ghi nhận móp méo, bản lề lỏng, ron cao su, ốc bị toét — dấu hiệu máy đã bung.',
    durationHint: '3 phút'
  },
  {
    id: 'mac-ownership',
    name: 'Khoá máy: MDM, DEP & iCloud',
    category: 'ownership',
    kind: 'automated',
    purpose:
      'Máy dính MDM/DEP hoặc Activation Lock thì cài lại macOS vẫn không dùng được — rủi ro lớn nhất khi mua MacBook cũ.',
    durationHint: '30 giây',
    isAvailable: (p) => p.platform === 'darwin'
  }
]

export function availableTests(profile: SystemProfile | null): TestDefinition[] {
  if (!profile) return TEST_CATALOG
  return TEST_CATALOG.filter((t) => !t.isAvailable || t.isAvailable(profile))
}

/**
 * Tien do kiem tra: chi dem cac hang muc ap dung cho may nay.
 * Bai dang chay chua tinh la xong, bai bo qua thi coi nhu da co ket luan.
 */
export function testProgress(
  profile: SystemProfile | null,
  results: Record<string, TestResult>
): { done: number; total: number } {
  const tests = availableTests(profile)
  const done = tests.filter((t) => {
    const status = results[t.id]?.status
    return status && status !== 'pending' && status !== 'running'
  }).length
  return { done, total: tests.length }
}

export const CATEGORY_LABEL: Record<TestCategory, string> = {
  input: 'Nhập liệu',
  display: 'Màn hình',
  audio: 'Âm thanh',
  camera: 'Camera',
  storage: 'Lưu trữ',
  thermal: 'Nhiệt & hiệu năng',
  battery: 'Pin',
  connectivity: 'Kết nối',
  physical: 'Ngoại hình',
  ownership: 'Khoá & quyền sở hữu'
}
