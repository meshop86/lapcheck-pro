import type { ComponentType } from 'react'
import KeyboardTest from './KeyboardTest'
import TouchpadTest from './TouchpadTest'
import DisplayPixelTest from './DisplayPixelTest'
import DisplayUniformityTest from './DisplayUniformityTest'
import DisplayMotionTest from './DisplayMotionTest'
import SpeakerTest from './SpeakerTest'
import MicrophoneTest from './MicrophoneTest'
import WebcamTest from './WebcamTest'
import DiskBenchTest from './DiskBenchTest'
import DiskHealthTest from './DiskHealthTest'
import OwnershipTest from './OwnershipTest'
import MemoryTestPanel from './MemoryTestPanel'
import CpuStressTest from './CpuStressTest'
import BatteryDrainTest from './BatteryDrainTest'
import { PhysicalTest, PortsTest } from './ManualChecklist'
import type { TestPanelProps } from './types'

/** Ánh xạ mã hạng mục trong TEST_CATALOG sang panel thực thi. */
export const TEST_PANELS: Record<string, ComponentType<TestPanelProps>> = {
  keyboard: KeyboardTest,
  touchpad: TouchpadTest,
  'display-pixel': DisplayPixelTest,
  'display-uniformity': DisplayUniformityTest,
  'display-motion': DisplayMotionTest,
  speaker: SpeakerTest,
  microphone: MicrophoneTest,
  webcam: WebcamTest,
  'disk-health': DiskHealthTest,
  'disk-benchmark': DiskBenchTest,
  'memory-test': MemoryTestPanel,
  'cpu-stress': CpuStressTest,
  'battery-drain': BatteryDrainTest,
  ports: PortsTest,
  physical: PhysicalTest,
  'mac-ownership': OwnershipTest
}

export type { TestPanelProps }
