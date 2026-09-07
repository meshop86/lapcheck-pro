import type { TestStatus } from '@shared/types'

/** Hợp đồng chung cho mọi panel test: tự kết luận rồi gọi onFinish. */
export interface TestPanelProps {
  onFinish: (
    status: TestStatus,
    summary: string,
    metrics?: Record<string, string | number>
  ) => void
  onClose: () => void
}
