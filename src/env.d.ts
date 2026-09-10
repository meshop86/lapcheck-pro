/// <reference types="vite/client" />
import type { ChipLapTestApi } from '../electron/preload'

declare global {
  interface Window {
    chipLapTest: ChipLapTestApi
  }
}

export {}
