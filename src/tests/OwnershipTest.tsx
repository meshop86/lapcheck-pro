import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react'
import type { OwnershipInfo } from '@shared/types'
import { Button } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { Instruction } from './shared'
import type { TestPanelProps } from './types'

type Level = 'ok' | 'warn' | 'bad' | 'unknown'

interface Check {
  label: string
  level: Level
  detail: string
}

const LEVEL_STYLE: Record<Level, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  warn: { icon: AlertTriangle, className: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  bad: { icon: ShieldAlert, className: 'border-rose-500/40 bg-rose-500/10 text-rose-200' },
  unknown: { icon: HelpCircle, className: 'border-ink-600 bg-ink-850 text-mist-300' }
}

/** Dich tung truong trong OwnershipInfo thanh mot dong ket luan doc duoc. */
function buildChecks(o: OwnershipInfo): Check[] {
  // Ba truong DEP/MDM/Activation Lock deu theo cung quy tac: bat = nguy hiem
  const flagLevel = (v: boolean | null): Level => (v === null ? 'unknown' : v ? 'bad' : 'ok')

  const checks: Check[] = [
    {
      label: 'Đăng ký DEP (Apple Business Manager)',
      level: flagLevel(o.depEnrolled),
      detail:
        o.depEnrolled === null
          ? 'Không đọc được. Cắm mạng rồi thử lại.'
          : o.depEnrolled
            ? 'Máy thuộc sở hữu một tổ chức. Cài lại macOS vẫn tự đăng ký lại — rủi ro cao nhất khi mua máy cũ.'
            : 'Máy không nằm trong hệ thống của tổ chức nào.'
    },
    {
      label: 'Quản lý từ xa (MDM)',
      level: flagLevel(o.mdmEnrolled),
      detail:
        o.mdmEnrolled === null
          ? 'Không đọc được trạng thái MDM.'
          : o.mdmEnrolled
            ? `Đang bị quản lý${o.mdmOrganization ? ` bởi ${o.mdmOrganization}` : ''}. Bên quản lý có thể khoá hoặc xoá máy từ xa.`
            : 'Không có hệ thống nào đang quản lý máy.'
    },
    {
      label: 'Activation Lock (khoá iCloud)',
      level: flagLevel(o.activationLocked),
      detail:
        o.activationLocked === null
          ? 'Máy không báo cáo trạng thái này — thường là Mac Intel đời trước 2018.'
          : o.activationLocked
            ? 'Máy đã khoá vào một Apple ID. Không có mật khẩu Apple ID đó thì máy vô dụng sau khi xoá.'
            : 'Không bị khoá vào Apple ID nào.'
    },
    {
      label: 'Tài khoản iCloud đang đăng nhập',
      level: o.icloudAccount ? (o.findMyEnabled ? 'bad' : 'warn') : 'ok',
      detail: o.icloudAccount
        ? `${o.icloudAccount}${o.findMyEnabled ? ' — Find My đang bật, xoá máy xong sẽ dính Activation Lock.' : ' — Find My đã tắt, nhưng vẫn cần đăng xuất trước khi nhận máy.'}`
        : 'Không có Apple ID nào đăng nhập trên máy.'
    },
    {
      label: 'Loại Apple ID',
      level: o.managedAppleId === null ? 'unknown' : o.managedAppleId ? 'warn' : 'ok',
      detail:
        o.managedAppleId === null
          ? 'Không xác định được.'
          : o.managedAppleId
            ? 'Managed Apple ID do tổ chức cấp — dấu hiệu máy của công ty hoặc trường học.'
            : 'Apple ID cá nhân.'
    }
  ]

  if (o.firmwarePassword !== null) {
    checks.push({
      label: 'Firmware password',
      level: o.firmwarePassword ? 'warn' : 'ok',
      detail: o.firmwarePassword
        ? 'Đã đặt mật khẩu firmware. Không biết mật khẩu thì không vào được Recovery và không cài lại máy.'
        : 'Chưa đặt mật khẩu firmware.'
    })
  }

  if (o.configProfiles !== null) {
    checks.push({
      label: 'Configuration profile đã cài',
      level: o.configProfiles > 0 ? 'warn' : 'ok',
      detail:
        o.configProfiles > 0
          ? `${o.configProfiles} profile có thể ép VPN, proxy hoặc giới hạn cài phần mềm.`
          : 'Không có profile nào được cài.'
    })
  }

  return checks
}

export default function OwnershipTest({ onFinish, onClose }: TestPanelProps) {
  const setProfile = useAppStore((s) => s.refreshProfile)
  const [ownership, setOwnership] = useState<OwnershipInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Doc lai tu dau: ky thuat vien thuong bat chu may dang xuat iCloud roi kiem tra lai
      const fresh = await window.lapcheck.getSystemProfile(true)
      setOwnership(fresh.ownership)
      await setProfile()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [setProfile])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="py-6 text-center text-sm text-mist-400">Đang đọc tình trạng khoá máy…</p>
  }

  if (error || !ownership) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-300">
          {error ?? 'Máy này không cung cấp dữ liệu khoá (chỉ macOS mới có).'}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Đóng</Button>
          <Button variant="primary" onClick={() => void load()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  const checks = buildChecks(ownership)
  const blockers = checks.filter((c) => c.level === 'bad')
  const cautions = checks.filter((c) => c.level === 'warn')

  function conclude(): void {
    const o = ownership as OwnershipInfo
    const metrics: Record<string, string | number> = {
      DEP: o.depEnrolled === null ? 'không đọc được' : o.depEnrolled ? 'có' : 'không',
      MDM: o.mdmEnrolled === null ? 'không đọc được' : o.mdmEnrolled ? 'có' : 'không',
      'Activation Lock':
        o.activationLocked === null ? 'không đọc được' : o.activationLocked ? 'bật' : 'tắt',
      'Apple ID đăng nhập': o.icloudAccount ?? 'không có',
      'Find My': o.findMyEnabled === null ? 'không đọc được' : o.findMyEnabled ? 'bật' : 'tắt'
    }
    if (o.mdmOrganization) metrics['Tổ chức quản lý'] = o.mdmOrganization

    if (blockers.length) {
      onFinish('failed', blockers.map((c) => c.label).join(', '), metrics)
    } else if (cautions.length) {
      onFinish('warning', `Cần xử lý trước khi nhận máy: ${cautions.map((c) => c.label).join(', ')}`, metrics)
    } else {
      onFinish('passed', 'Máy sạch khoá: không DEP, không MDM, không Activation Lock', metrics)
    }
  }

  return (
    <div className="space-y-4">
      <Instruction>
        Cắm mạng trước khi chạy để máy hỏi lại máy chủ Apple. Nếu còn Apple ID đăng nhập, bắt chủ
        máy đăng xuất iCloud ngay tại chỗ rồi bấm Kiểm tra lại.
      </Instruction>

      <div className="space-y-1">
        {checks.map((check) => {
          const style = LEVEL_STYLE[check.level]
          const Icon = style.icon
          return (
            <div
              key={check.label}
              className={`flex gap-3 rounded-lg border px-3 py-2 ${style.className}`}
            >
              <Icon size={15} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">{check.label}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed opacity-90">{check.detail}</div>
              </div>
            </div>
          )
        })}
      </div>

      {ownership.notes.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-[11px] text-mist-400">
          {ownership.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Đóng</Button>
        <Button onClick={() => void load()}>Kiểm tra lại</Button>
        <Button variant="primary" onClick={conclude}>
          Ghi kết luận
        </Button>
      </div>
    </div>
  )
}
