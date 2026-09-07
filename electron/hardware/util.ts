import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  error: string | null
}

/**
 * Chay mot lenh he thong an toan (khong qua shell -> tranh command injection).
 * Khong bao gio throw: loi duoc tra ve trong ket qua de tang tren tu quyet dinh.
 */
export async function run(
  file: string,
  args: string[] = [],
  timeoutMs = 15_000
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true
    })
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '', error: null }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      error: e.message ?? String(err)
    }
  }
}

/** Chay doan script PowerShell va parse JSON tra ve. */
export async function powershellJson<T>(script: string, timeoutMs = 20_000): Promise<T | null> {
  const wrapped = `$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';${script}`
  const res = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
    timeoutMs
  )
  if (!res.ok) return null
  return parseJson<T>(res.stdout)
}

export function parseJson<T>(text: string): T | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}

export function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.eE+-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Cac chuoi placeholder ma firmware/WMI de lai khi nha san xuat khong dien thong tin. */
const JUNK_VALUE =
  /^(to be filled by o\.?e\.?m\.?|default string|none|n\/?a|unknown|system (serial number|manufacturer|product name|version)|chassis (manufacturer|version)|vendor strings? (are )?placed here\.?|manufacturer|product name|not (specified|applicable|available)|null|0+|\.+|-+)$/i

export function toStr(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  const s = String(value).trim()
  // Firmware/WMI thuong tra ve chuoi rac cho truong chua duoc dien
  if (!s || JUNK_VALUE.test(s)) return fallback
  return s
}

/**
 * Loc so serial rac: chuoi qua ngan hoac chi lap lai mot ky tu ("1", "0000")
 * khong phai serial that ma la gia tri mac dinh cua firmware.
 */
export function toSerial(value: unknown): string | null {
  const s = toStr(value)
  if (s.length < 4) return null
  if (new Set(s.replace(/[^a-z0-9]/gi, '')).size <= 1) return null
  return s
}

export function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** Chay nhieu tac vu doc phan cung song song, loi cua mot cai khong lam hong ca cum. */
export async function settle<T>(
  label: string,
  task: () => Promise<T>,
  fallback: T,
  warnings: string[]
): Promise<T> {
  try {
    return await task()
  } catch (err) {
    warnings.push(`${label}: ${(err as Error).message}`)
    return fallback
  }
}
