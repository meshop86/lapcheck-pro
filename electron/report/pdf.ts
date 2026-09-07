import { BrowserWindow } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Inspection } from '@shared/types'
import { renderReportHtml } from './html'

function safeFileName(inspection: Inspection): string {
  const label = (inspection.meta.deviceLabel || inspection.profile.machine.model || 'laptop')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const date = inspection.createdAt.slice(0, 10)
  return `LapCheck-${label || 'laptop'}-${date}-${inspection.id.slice(0, 6)}.pdf`
}

/**
 * Kết xuất phiếu kiểm định ra PDF.
 * Dùng một cửa sổ ẩn để Chromium tự lo phần dàn trang và font tiếng Việt.
 */
export async function exportInspectionPdf(
  inspection: Inspection,
  outputDir: string
): Promise<string> {
  await mkdir(outputDir, { recursive: true })
  const html = renderReportHtml(inspection)

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false, sandbox: true }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
      preferCSSPageSize: true
    })
    const path = join(outputDir, safeFileName(inspection))
    await writeFile(path, pdf)
    return path
  } finally {
    win.destroy()
  }
}
