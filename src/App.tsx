import { useEffect, useState } from 'react'
import {
  Activity,
  Check,
  ClipboardList,
  Copy,
  Cpu,
  FileText,
  Heart,
  History,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'
import { testProgress } from '@/lib/testCatalog'
import { useAppStore } from '@/store/useAppStore'
import Dashboard from '@/pages/Dashboard'
import SystemInfo from '@/pages/SystemInfo'
import TestSuite from '@/pages/TestSuite'
import Report from '@/pages/Report'
import HistoryPage from '@/pages/HistoryPage'

const AUTHOR = {
  name: 'Lương Xuân Hoà',
  phone: '0797899666',
  bank: 'MB Bank'
}

/**
 * Mot dong thong tin bam la chep duoc.
 * Ky thuat vien hay phai goi hoac chuyen khoan tu may khach nen cho chep nhanh
 * tien hon la bat ho tu go lai so.
 */
function CopyRow({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof Phone
  label: string
  value: string
  tone: 'plain' | 'donate'
}) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* trinh duyet chan clipboard thi bo qua, so van hien de doc bang mat */
    }
  }

  return (
    <button
      onClick={() => void copy()}
      title={`Chép ${label.toLowerCase()}`}
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] transition-colors ${
        tone === 'donate'
          ? 'text-rose-300/90 hover:bg-rose-500/10'
          : 'text-mist-300 hover:bg-ink-800'
      }`}
    >
      <Icon size={12} className="shrink-0 opacity-80" />
      <span className="flex-1 truncate text-left tabular-nums">{label}</span>
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-400" />
      ) : (
        <Copy size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  )
}

/** Thong tin nguoi lam phan mem, dat ngay duoi menu ben trai. */
function AuthorCard() {
  return (
    <div className="mx-2 mt-3 rounded-lg border border-ink-800 bg-ink-850/70 p-2">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-600/20 text-[9px] font-semibold text-accent-500">
          LXH
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium leading-tight text-slate-200">
            {AUTHOR.name}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-mist-400">Tác giả</div>
        </div>
      </div>
      <CopyRow icon={Phone} label={AUTHOR.phone} value={AUTHOR.phone} tone="plain" />
      <CopyRow
        icon={Heart}
        label={`Donate · ${AUTHOR.bank}`}
        value={AUTHOR.phone}
        tone="donate"
      />
      <div className="px-2 pt-1 text-[9px] leading-tight text-mist-400/70">
        Số tài khoản {AUTHOR.bank}: {AUTHOR.phone}
      </div>
    </div>
  )
}

type PageId = 'dashboard' | 'system' | 'tests' | 'report' | 'history'

const NAV: { id: PageId; label: string; icon: typeof Activity; hint: string }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: Activity, hint: 'Tình trạng máy trong một màn hình' },
  { id: 'system', label: 'Thông tin máy', icon: Cpu, hint: 'Toàn bộ thông số phần cứng' },
  { id: 'tests', label: 'Kiểm tra', icon: ClipboardList, hint: 'Chạy từng hạng mục' },
  { id: 'report', label: 'Báo cáo', icon: FileText, hint: 'Chấm điểm và xuất PDF' },
  { id: 'history', label: 'Lịch sử', icon: History, hint: 'Các máy đã kiểm định' }
]

/** Logo: con chip mang dau tick dat tren than laptop - dung chung voi icon ung dung. */
function BrandMark() {
  return (
    <svg viewBox="0 0 1024 1024" className="h-7 w-7 shrink-0" aria-label="chipLapTest">
      <rect width="1024" height="1024" rx="228" fill="#101b2e" />
      <g fill="#0ea5e9">
        <rect x="330" y="184" width="34" height="70" rx="16" />
        <rect x="440" y="184" width="34" height="70" rx="16" />
        <rect x="550" y="184" width="34" height="70" rx="16" />
        <rect x="660" y="184" width="34" height="70" rx="16" />
        <rect x="330" y="588" width="34" height="70" rx="16" />
        <rect x="440" y="588" width="34" height="70" rx="16" />
        <rect x="550" y="588" width="34" height="70" rx="16" />
        <rect x="660" y="588" width="34" height="70" rx="16" />
        <rect x="228" y="286" width="70" height="34" rx="16" />
        <rect x="228" y="396" width="70" height="34" rx="16" />
        <rect x="228" y="506" width="70" height="34" rx="16" />
        <rect x="726" y="286" width="70" height="34" rx="16" />
        <rect x="726" y="396" width="70" height="34" rx="16" />
        <rect x="726" y="506" width="70" height="34" rx="16" />
      </g>
      <rect
        x="272"
        y="228"
        width="480"
        height="386"
        rx="64"
        fill="#0B1424"
        stroke="#0ea5e9"
        strokeWidth="26"
      />
      <path
        d="M382 424 L470 512 L644 338"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="62"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M232 700 H792 L864 806 A28 28 0 0 1 840 848 H184 A28 28 0 0 1 160 806 Z"
        fill="#1E3350"
      />
      <rect x="430" y="762" width="164" height="26" rx="13" fill="#0B1424" />
    </svg>
  )
}

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const { init, profile, profileLoading, profileError, appInfo, refreshProfile, results } =
    useAppStore()

  useEffect(() => {
    void init()
  }, [init])

  const { done, total } = testProgress(profile, results)

  return (
    <div className="flex h-full bg-ink-950">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="drag-region flex h-14 items-center gap-2 px-4 pt-2">
          <BrandMark />
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-100">chipLapTest</div>
            <div className="text-[10px] uppercase tracking-wider text-mist-400">
              Kiểm định laptop
            </div>
          </div>
        </div>

        <nav className="mt-2 space-y-0.5 px-2">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                title={item.hint}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-accent-600/15 text-accent-500'
                    : 'text-mist-300 hover:bg-ink-850 hover:text-slate-100'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'tests' && (
                  <span className="rounded-full bg-ink-800 px-1.5 text-[10px] tabular-nums text-mist-400">
                    {done}/{total}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <AuthorCard />

        <div className="flex-1" />

        <div className="space-y-2 border-t border-ink-800 p-3">
          {appInfo && (
            <div
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] ${
                appInfo.privileged
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'bg-amber-500/10 text-amber-300'
              }`}
            >
              {appInfo.privileged ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
              <span className="leading-tight">
                {appInfo.privileged
                  ? 'Đang chạy quyền quản trị'
                  : 'Quyền thường — thiếu SMART & cảm biến'}
              </span>
            </div>
          )}
          <button
            onClick={() => void refreshProfile()}
            disabled={profileLoading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-700 py-1.5 text-xs text-mist-300 transition-colors hover:border-accent-600 hover:text-white disabled:opacity-50"
          >
            {profileLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Quét lại phần cứng
          </button>
          {appInfo && (
            <div className="text-center text-[10px] text-ink-600">
              v{appInfo.version} · Electron {appInfo.electron}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="drag-region h-3" />
        {profileError && (
          <div className="mx-6 mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Không đọc được thông tin máy: {profileError}
          </div>
        )}
        {!profile && profileLoading && (
          <div className="flex h-[80vh] flex-col items-center justify-center gap-3 text-mist-300">
            <Loader2 size={28} className="animate-spin text-accent-500" />
            <p className="text-sm">Đang quét phần cứng…</p>
            <p className="text-xs text-mist-400">
              Lần quét đầu mất khoảng 10–20 giây vì phải đọc SMART và EDID
            </p>
          </div>
        )}
        {profile && (
          <div className="px-6 pb-10">
            {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
            {page === 'system' && <SystemInfo />}
            {page === 'tests' && <TestSuite />}
            {page === 'report' && <Report />}
            {page === 'history' && <HistoryPage />}
          </div>
        )}
      </main>
    </div>
  )
}

export type { PageId }
