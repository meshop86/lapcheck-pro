/**
 * Cham diem suc khoe o cung tu du lieu SMART.
 * Dung chung cho panel test, bao cao PDF va man hinh thong tin -> mot cong thuc duy nhat.
 */
import type { StorageDevice } from './types'

export type DiskVerdict = 'good' | 'fair' | 'poor' | 'failing' | 'unknown'

export interface DiskIssue {
  level: 'bad' | 'warn' | 'info'
  text: string
}

export interface DiskHealth {
  device: StorageDevice
  /** 0-100, cang cao cang tot. null khi khong doc duoc SMART */
  score: number | null
  verdict: DiskVerdict
  /** Cau ket luan ngan gon bang tieng Viet */
  summary: string
  issues: DiskIssue[]
  /** So lan ghi day o, quy doi de so sanh giua cac dung luong khac nhau */
  driveWrites: number | null
}

export const VERDICT_LABEL: Record<DiskVerdict, string> = {
  good: 'Tốt',
  fair: 'Dùng được',
  poor: 'Đã xuống cấp',
  failing: 'Sắp hỏng',
  unknown: 'Chưa đủ dữ liệu'
}

const fmtTB = (bytes: number): string => `${(bytes / 1e12).toFixed(2)} TB`;

const fmtHours = (h: number): string => {
  const years = h / 8760
  return years >= 1 ? `${h.toLocaleString('vi-VN')} giờ (~${years.toFixed(1)} năm)` : `${h} giờ`
}

/**
 * Bat dau tu 100 diem roi tru dan theo tung dau hieu hao mon.
 * Nguong lay theo kinh nghiem mua ban may cu, khong phai chuan cua nha san xuat.
 */
export function assessDisk(device: StorageDevice): DiskHealth {
  const s = device.smart
  const issues: DiskIssue[] = []
  const driveWrites =
    s.dataWrittenBytes !== null && device.sizeBytes > 0
      ? s.dataWrittenBytes / device.sizeBytes
      : null

  if (!s.available) {
    return {
      device,
      score: null,
      verdict: 'unknown',
      summary: s.error ?? 'Không đọc được SMART của ổ này',
      issues: [{ level: 'info', text: s.error ?? 'Ổ không trả về dữ liệu SMART.' }],
      driveWrites
    }
  }

  let score = 100

  if (s.healthy === false) {
    score -= 60
    issues.push({ level: 'bad', text: 'Ổ tự đánh giá SMART là FAILED — dữ liệu có thể mất bất cứ lúc nào.' })
  }

  if (s.reallocatedSectors) {
    score -= Math.min(40, 10 + s.reallocatedSectors)
    issues.push({
      level: 'bad',
      text: `${s.reallocatedSectors} sector hỏng đã bị thay thế. Con số này chỉ tăng chứ không giảm.`
    })
  }

  if (s.pendingSectors) {
    score -= Math.min(40, 15 + s.pendingSectors)
    issues.push({
      level: 'bad',
      text: `${s.pendingSectors} sector đang chờ xử lý — hỏng đang diễn ra ngay lúc này.`
    })
  }

  if (s.mediaErrors) {
    score -= Math.min(30, 10 + s.mediaErrors)
    issues.push({ level: 'bad', text: `${s.mediaErrors} lỗi media không sửa được ở tầng NVMe.` })
  }

  if (s.uncorrectableErrors) {
    score -= Math.min(20, s.uncorrectableErrors * 2)
    issues.push({ level: 'warn', text: `${s.uncorrectableErrors} lỗi đọc không sửa được.` })
  }

  if (s.percentageUsed !== null) {
    // Tuoi tho ghi da dung: 0% la o moi, 100% la het han bao hanh do ben
    score -= Math.round(s.percentageUsed * 0.4)
    if (s.percentageUsed >= 80) {
      issues.push({ level: 'bad', text: `Đã dùng ${s.percentageUsed}% tuổi thọ ghi của ổ.` })
    } else if (s.percentageUsed >= 40) {
      issues.push({ level: 'warn', text: `Đã dùng ${s.percentageUsed}% tuổi thọ ghi của ổ.` })
    } else {
      issues.push({ level: 'info', text: `Mới dùng ${s.percentageUsed}% tuổi thọ ghi.` })
    }
  }

  if (driveWrites !== null) {
    if (driveWrites >= 600) {
      score -= 20
      issues.push({
        level: 'bad',
        text: `Đã ghi ${fmtTB(s.dataWrittenBytes as number)}, tương đương ghi đầy ổ ${Math.round(driveWrites)} lần — vượt mức bảo hành độ bền của SSD tiêu dùng.`
      })
    } else if (driveWrites >= 300) {
      score -= 8
      issues.push({
        level: 'warn',
        text: `Đã ghi ${fmtTB(s.dataWrittenBytes as number)}, tương đương ghi đầy ổ ${Math.round(driveWrites)} lần.`
      })
    } else {
      issues.push({
        level: 'info',
        text: `Đã ghi ${fmtTB(s.dataWrittenBytes as number)} (ghi đầy ổ ~${driveWrites.toFixed(1)} lần).`
      })
    }
  }

  if (s.powerOnHours !== null) {
    if (s.powerOnHours >= 20000) {
      score -= 15
      issues.push({ level: 'warn', text: `Ổ đã chạy ${fmtHours(s.powerOnHours)} — rất nhiều.` })
    } else if (s.powerOnHours >= 8000) {
      score -= 6
      issues.push({ level: 'warn', text: `Ổ đã chạy ${fmtHours(s.powerOnHours)}.` })
    } else {
      issues.push({ level: 'info', text: `Ổ đã chạy ${fmtHours(s.powerOnHours)}.` })
    }
  }

  if (s.temperatureC !== null && s.temperatureC >= 70) {
    score -= 5
    issues.push({ level: 'warn', text: `Ổ đang nóng ${s.temperatureC}°C, cao hơn mức an toàn.` })
  }

  if (s.criticalWarning) {
    score -= 25
    issues.push({ level: 'bad', text: `Controller NVMe đang bật cờ cảnh báo (critical warning = ${s.criticalWarning}).` })
  }

  score = Math.max(0, Math.min(100, score))

  // O chi bao "OK" ma khong co so lieu hao mon thi khong the ket luan la con moi
  const hasWearData =
    s.percentageUsed !== null || s.powerOnHours !== null || s.dataWrittenBytes !== null
  if (!hasWearData) {
    issues.push({
      level: 'info',
      text: 'Ổ chỉ báo trạng thái tổng quát, chưa có giờ chạy hay tuổi thọ ghi để đánh giá độ hao mòn.'
    })
  }

  // Chi co trang thai "OK" thi khong du de cham diem. Bia ra mot con so o day chinh la
  // ly do moi may deu hien 100/100 - tha noi thang la chua doc du du lieu.
  const scored = hasWearData || s.healthy === false ? score : null

  const verdict: DiskVerdict =
    s.healthy === false
      ? 'failing'
      : scored === null
        ? 'unknown'
        : scored < 40
          ? 'failing'
          : scored < 60
            ? 'poor'
            : scored < 80
              ? 'fair'
              : 'good'

  const summary =
    verdict === 'failing'
      ? 'Ổ sắp hỏng, cần thay trước khi bán máy'
      : verdict === 'poor'
        ? 'Ổ đã xuống cấp rõ rệt, nên trừ giá'
        : verdict === 'unknown'
          ? 'Ổ báo bình thường nhưng thiếu số liệu hao mòn để kết luận'
          : verdict === 'fair'
            ? 'Ổ còn dùng được nhưng đã có hao mòn'
            : 'Ổ còn khoẻ, không có dấu hiệu bất thường'

  return { device, score: scored, verdict, summary, issues, driveWrites }
}

/** O ao (file .dmg, .vhd) va o cam ngoai khong phai phan cung cua may. */
const EXTERNAL_INTERFACE = /usb|thunderbolt|firewire|disk image|virtual|sd card/i

/** True neu o nay thuoc ve chinh chiec may dang kiem tra. */
export function isInternalDisk(device: StorageDevice): boolean {
  return !device.removable && !EXTERNAL_INTERFACE.test(device.interfaceType)
}

/** Cham diem cac o gan trong may, bo qua o cam ngoai va o ao. */
export function assessDisks(devices: StorageDevice[]): DiskHealth[] {
  return devices.filter(isInternalDisk).map(assessDisk)
}
