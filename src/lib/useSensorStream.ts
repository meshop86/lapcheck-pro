import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

/**
 * Chỉ mở luồng cảm biến khi màn hình đang cần.
 * Trên Windows mỗi nhịp đọc phải gọi PowerShell nên không để chạy nền vô ích.
 */
export function useSensorStream(active: boolean): void {
  const pushSensor = useAppStore((s) => s.pushSensor)
  useEffect(() => {
    if (!active) return
    return window.lapcheck.startSensorStream(pushSensor)
  }, [active, pushSensor])
}
