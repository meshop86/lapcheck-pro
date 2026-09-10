import { create } from 'zustand'
import type { AppInfo } from '@shared/ipc'
import type {
  Finding,
  Grade,
  Inspection,
  InspectionMeta,
  SensorSnapshot,
  StressResult,
  SystemProfile,
  TestResult,
  TestStatus
} from '@shared/types'
import { analyze } from '@shared/analyze'
import { TEST_CATALOG, availableTests } from '@/lib/testCatalog'

function blankResult(id: string, name: string, category: TestResult['category']): TestResult {
  return {
    id,
    name,
    category,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    summary: '',
    metrics: {},
    notes: ''
  }
}

function initialResults(): Record<string, TestResult> {
  return Object.fromEntries(
    TEST_CATALOG.map((t) => [t.id, blankResult(t.id, t.name, t.category)])
  )
}

const initialMeta: InspectionMeta = {
  technician: '',
  customerRef: '',
  deviceLabel: '',
  condition: 'used',
  notes: ''
}

interface AppState {
  appInfo: AppInfo | null
  profile: SystemProfile | null
  profileLoading: boolean
  profileError: string | null
  sensors: SensorSnapshot | null
  sensorHistory: SensorSnapshot[]
  results: Record<string, TestResult>
  meta: InspectionMeta
  stress: StressResult | null
  savedId: string | null

  init: () => Promise<void>
  refreshProfile: () => Promise<void>
  pushSensor: (snapshot: SensorSnapshot) => void
  startTest: (id: string) => void
  finishTest: (
    id: string,
    status: TestStatus,
    summary: string,
    metrics?: Record<string, string | number>
  ) => void
  setNotes: (id: string, notes: string) => void
  skipTest: (id: string) => void
  resetTests: () => void
  setMeta: (patch: Partial<InspectionMeta>) => void
  setStress: (result: StressResult | null) => void
  setSavedId: (id: string | null) => void
  buildInspection: () => Inspection | null
  analysis: () => { findings: Finding[]; grade: Grade }
}

const MAX_SENSOR_HISTORY = 600

export const useAppStore = create<AppState>((set, get) => ({
  appInfo: null,
  profile: null,
  profileLoading: false,
  profileError: null,
  sensors: null,
  sensorHistory: [],
  results: initialResults(),
  meta: initialMeta,
  stress: null,
  savedId: null,

  init: async () => {
    set({ profileLoading: true, profileError: null })
    try {
      const [appInfo, profile] = await Promise.all([
        window.chipLapTest.getAppInfo(),
        window.chipLapTest.getSystemProfile(false)
      ])
      const deviceLabel = `${profile.machine.manufacturer} ${profile.machine.model}`.trim()
      set((state) => ({
        appInfo,
        profile,
        profileLoading: false,
        meta: { ...state.meta, deviceLabel: state.meta.deviceLabel || deviceLabel }
      }))
    } catch (err) {
      set({ profileLoading: false, profileError: (err as Error).message })
    }
  },

  refreshProfile: async () => {
    set({ profileLoading: true, profileError: null })
    try {
      set({ profile: await window.chipLapTest.getSystemProfile(true), profileLoading: false })
    } catch (err) {
      set({ profileLoading: false, profileError: (err as Error).message })
    }
  },

  pushSensor: (snapshot) =>
    set((state) => ({
      sensors: snapshot,
      sensorHistory: [...state.sensorHistory, snapshot].slice(-MAX_SENSOR_HISTORY)
    })),

  startTest: (id) =>
    set((state) => ({
      results: {
        ...state.results,
        [id]: {
          ...state.results[id],
          status: 'running',
          startedAt: new Date().toISOString(),
          finishedAt: null,
          summary: '',
          metrics: {}
        }
      }
    })),

  finishTest: (id, status, summary, metrics = {}) =>
    set((state) => {
      const current = state.results[id]
      const finishedAt = new Date().toISOString()
      const startedAt = current.startedAt ?? finishedAt
      return {
        results: {
          ...state.results,
          [id]: {
            ...current,
            status,
            summary,
            metrics,
            finishedAt,
            startedAt,
            durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime()
          }
        }
      }
    }),

  setNotes: (id, notes) =>
    set((state) => ({ results: { ...state.results, [id]: { ...state.results[id], notes } } })),

  skipTest: (id) =>
    set((state) => ({
      results: {
        ...state.results,
        [id]: { ...state.results[id], status: 'skipped', summary: 'Kỹ thuật viên bỏ qua' }
      }
    })),

  resetTests: () => set({ results: initialResults(), stress: null, savedId: null }),

  setMeta: (patch) => set((state) => ({ meta: { ...state.meta, ...patch } })),

  setStress: (stress) => set({ stress }),

  setSavedId: (savedId) => set({ savedId }),

  analysis: () => {
    const { profile, results, stress } = get()
    if (!profile) return { findings: [], grade: { score: 0, letter: 'F', label: '—', deductions: [] } }
    return analyze({ profile, results: activeResults(profile, results), stress })
  },

  buildInspection: () => {
    const { profile, results, meta, stress } = get()
    if (!profile) return null
    const list = activeResults(profile, results)
    const { findings, grade } = analyze({ profile, results: list, stress })
    return {
      id: crypto.randomUUID().slice(0, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
      meta,
      profile,
      results: list,
      findings,
      grade
    }
  }
}))

/** Chỉ tính các hạng mục thực sự áp dụng cho máy này. */
function activeResults(
  profile: SystemProfile,
  results: Record<string, TestResult>
): TestResult[] {
  return availableTests(profile)
    .map((t) => results[t.id])
    .filter(Boolean)
}
