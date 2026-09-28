import { TEST_BY_ID } from './catalog'
import type { LabValue, Report, Status } from './types'
import { pct } from './util'

export interface TrendPoint {
  date: string
  value: number
  status: Status
  lab: string
  report_id: string
  low: number | null
  high: number | null
  unit: string | null
}

export function series(values: LabValue[], reports: Report[], patientId: string, testId: string): TrendPoint[] {
  const labs = Object.fromEntries(reports.map((r) => [r.id, r.lab_name]))
  return values
    .filter((v) => v.patient_id === patientId && v.test_id === testId && v.included && v.value_num != null && labs[v.report_id] !== undefined)
    .map((v) => ({ date: v.report_date, value: v.value_num as number, status: v.status, lab: labs[v.report_id], report_id: v.report_id, low: v.ref_low, high: v.ref_high, unit: v.unit }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface TrackedTest {
  testId: string
  name: string
  points: TrendPoint[]
  overallPct: number | null
  lastPct: number | null
  delta: boolean
  movingWithinRange: boolean
}

/** Every test with 2+ numeric readings, most dramatic movement first. */
export function tracked(values: LabValue[], reports: Report[], patientId: string): TrackedTest[] {
  const ids = [...new Set(values.filter((v) => v.patient_id === patientId && v.test_id).map((v) => v.test_id as string))]
  const out: TrackedTest[] = []
  for (const id of ids) {
    const pts = series(values, reports, patientId, id)
    if (pts.length < 2) continue
    const a = pts[pts.length - 2]
    const b = pts[pts.length - 1]
    const lastPct = pct(a.value, b.value)
    const t = TEST_BY_ID[id]
    const delta = lastPct != null && Math.abs(lastPct) >= (t?.deltaPct ?? 20) && Math.abs(b.value - a.value) >= minDelta(b)
    out.push({
      testId: id,
      name: t?.name ?? id,
      points: pts,
      overallPct: pct(pts[0].value, b.value),
      lastPct,
      delta,
      movingWithinRange: delta && a.status === 'normal' && b.status === 'normal',
    })
  }
  return out.sort((x, y) => Math.abs(y.overallPct ?? 0) - Math.abs(x.overallPct ?? 0))
}

/** A big percentage of a tiny number (CRP 0.1 -> 0.3 is +200%) is noise: a
 *  change must also be at least 10% of the reference range's scale.
 *  Mirrors min_delta() in api/app/main.py. */
export function minDelta(p: Pick<TrendPoint, 'low' | 'high'>): number {
  if (p.low != null && p.high != null && p.high > p.low) return 0.1 * (p.high - p.low)
  const bound = p.high ?? p.low
  return bound ? 0.1 * Math.abs(bound) : 0
}

export function fmtPct(p: number | null): string {
  if (p == null) return '—'
  const r = Math.round(p * 10) / 10
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(Math.abs(r) < 10 ? 1 : 0)}%`
}
