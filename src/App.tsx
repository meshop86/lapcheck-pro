import { useEffect, useState } from 'react'
import {
  Activity,
  ClipboardList,
  Cpu,
  FileText,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import Dashboard from '@/pages/Dashboard'
import SystemInfo from '@/pages/SystemInfo'
import TestSuite from '@/pages/TestSuite'
import Report from '@/pages/Report'
import HistoryPage from '@/pages/HistoryPage'

type PageId = 'dashboard' | 'system' | 'tests' | 'report' | 'history'

const NAV: { id: PageId; label: string; icon: typeof Activity; hint: string }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: Activity, hint: 'Tình trạng máy trong một màn hình' },
  { id: 'system', label: 'Thông tin máy', icon: Cpu, hint: 'Toàn bộ thông số phần cứng' },
  { id: 'tests', label: 'Kiểm tra', icon: ClipboardList, hint: 'Chạy từng hạng mục' },
  { id: 'report', label: 'Báo cáo', icon: FileText, hint: 'Chấm điểm và xuất PDF' },
  { id: 'history', label: 'Lịch sử', icon: History, hint: 'Các máy đã kiểm định' }
]

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const { init, profile, profileLoading, profileError, appInfo, refreshProfile, results } =
    useAppStore()

  useEffect(() => {
    void init()
  }, [init])

  const done = Object.values(results).filter(
    (r) => r.status !== 'pending' && r.status !== 'skipped'
  ).length
  const total = Object.values(results).length

  return (
    <div className="flex h-full bg-ink-950">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="drag-region flex h-14 items-center gap-2 px-4 pt-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600 text-sm font-bold text-white">
            L
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-100">LapCheck Pro</div>
            <div className="text-[10px] uppercase tracking-wider text-mist-400">
              Kiểm định laptop
            </div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-0.5 px-2">
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
