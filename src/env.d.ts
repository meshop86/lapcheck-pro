/// <reference types="vite/client" />
import type { LapCheckApi } from '../electron/preload'

declare global {
  interface Window {
    lapcheck: LapCheckApi
  }
}

export {}
