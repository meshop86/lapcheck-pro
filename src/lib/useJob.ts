import { useEffect, useState } from 'react'
import type { ProgressEvent } from '@shared/types'

/** Lắng nghe tiến độ của một job chạy ở main process. */
export function useJobProgress(jobId: string): ProgressEvent | null {
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  useEffect(() => {
    return window.chipLapTest.onProgress((event) => {
      if (event.jobId === jobId) setProgress(event)
    })
  }, [jobId])
  return progress
}

/** Mã job ngắn, đủ duy nhất trong một phiên làm việc. */
export function newJobId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}
