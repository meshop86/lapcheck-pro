import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { Inspection, InspectionSummaryRow } from '@shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS inspections (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  device_label TEXT NOT NULL,
  serial       TEXT NOT NULL,
  technician   TEXT NOT NULL,
  grade_letter TEXT NOT NULL,
  score        INTEGER NOT NULL,
  passed       INTEGER NOT NULL,
  failed       INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  payload      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspections_created ON inspections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_serial  ON inspections(serial);
`

let db: DatabaseSync | null = null

export function initDatabase(userDataDir: string): DatabaseSync {
  if (db) return db
  mkdirSync(userDataDir, { recursive: true })
  db = new DatabaseSync(join(userDataDir, 'lapcheck.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

function requireDb(): DatabaseSync {
  if (!db) throw new Error('Cơ sở dữ liệu chưa được khởi tạo')
  return db
}

function countByStatus(inspection: Inspection): { passed: number; failed: number; total: number } {
  const passed = inspection.results.filter((r) => r.status === 'passed').length
  const failed = inspection.results.filter((r) => r.status === 'failed').length
  return { passed, failed, total: inspection.results.length }
}

export function saveInspection(inspection: Inspection): string {
  const { passed, failed, total } = countByStatus(inspection)
  requireDb()
    .prepare(
      `INSERT INTO inspections
        (id, created_at, device_label, serial, technician, grade_letter, score, passed, failed, total, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        created_at=excluded.created_at, device_label=excluded.device_label,
        serial=excluded.serial, technician=excluded.technician,
        grade_letter=excluded.grade_letter, score=excluded.score,
        passed=excluded.passed, failed=excluded.failed, total=excluded.total,
        payload=excluded.payload`
    )
    .run(
      inspection.id,
      inspection.createdAt,
      inspection.meta.deviceLabel || `${inspection.profile.machine.manufacturer} ${inspection.profile.machine.model}`.trim(),
      inspection.profile.machine.serial,
      inspection.meta.technician,
      inspection.grade.letter,
      inspection.grade.score,
      passed,
      failed,
      total,
      JSON.stringify(inspection)
    )
  return inspection.id
}

export function listInspections(limit = 200): InspectionSummaryRow[] {
  const rows = requireDb()
    .prepare(
      `SELECT id, created_at, device_label, serial, technician, grade_letter, score, passed, failed, total
       FROM inspections ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Record<string, string | number>[]

  return rows.map((r) => ({
    id: String(r.id),
    createdAt: String(r.created_at),
    deviceLabel: String(r.device_label),
    serial: String(r.serial),
    technician: String(r.technician),
    gradeLetter: String(r.grade_letter) as InspectionSummaryRow['gradeLetter'],
    score: Number(r.score),
    passed: Number(r.passed),
    failed: Number(r.failed),
    total: Number(r.total)
  }))
}

export function getInspection(id: string): Inspection | null {
  const row = requireDb().prepare('SELECT payload FROM inspections WHERE id = ?').get(id) as
    | { payload: string }
    | undefined
  if (!row) return null
  return JSON.parse(row.payload) as Inspection
}

export function deleteInspection(id: string): boolean {
  const info = requireDb().prepare('DELETE FROM inspections WHERE id = ?').run(id)
  return Number(info.changes) > 0
}

/** Các lần kiểm định trước của cùng một máy — dùng để đối chiếu linh kiện có bị đổi không. */
export function historyForSerial(serial: string, excludeId?: string): InspectionSummaryRow[] {
  if (!serial) return []
  const rows = requireDb()
    .prepare(
      `SELECT id, created_at, device_label, serial, technician, grade_letter, score, passed, failed, total
       FROM inspections WHERE serial = ? AND id != ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(serial, excludeId ?? '') as Record<string, string | number>[]
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: String(r.created_at),
    deviceLabel: String(r.device_label),
    serial: String(r.serial),
    technician: String(r.technician),
    gradeLetter: String(r.grade_letter) as InspectionSummaryRow['gradeLetter'],
    score: Number(r.score),
    passed: Number(r.passed),
    failed: Number(r.failed),
    total: Number(r.total)
  }))
}
