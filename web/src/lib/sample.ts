import sample from '@shared/sample.json'
import { analyseRow, type RowInput } from './analyse'
import type { LabValue, Patient, Report } from './types'
import { ageOn } from './util'

/** Illustrative sample data from the product brief. Statuses in the file are
 *  ignored — every value is re-classified by classify(). */
interface SampleValue {
  test: string; value?: number; value_text?: string; unit?: string; low?: number | null; high?: number | null
  ref_source?: string; raw_name?: string; expected?: string
}
interface SampleFile {
  patient: { name: string; sex: 'F' | 'M'; birth_year: number }
  reports: { id: string; date: string; lab: string }[]
  values_latest: SampleValue[]
  trends: Record<string, { date: string; v: number }[]>
}
const S = sample as unknown as SampleFile

export const SAMPLE_PATIENT_ID = 'p-sample'

export function samplePatient(): Patient {
  return { id: SAMPLE_PATIENT_ID, name: S.patient.name, sex: S.patient.sex, birth_year: S.patient.birth_year, created_at: new Date().toISOString(), sample: true }
}

function rowFromSample(v: SampleValue): RowInput {
  const printed = v.ref_source === 'report'
  return {
    raw_name: v.raw_name ?? v.test,
    value_num: v.value ?? null,
    value_text: v.value_text ?? null,
    unit: v.unit ?? null,
    ref_low: printed ? v.low ?? null : null,
    ref_high: printed ? v.high ?? null : null,
    ref_text: v.expected ?? null,
    has_range: printed,
  }
}

/** The two older reports, saved straight away so trends work at once. */
export function sampleHistory(): { reports: Report[]; values: LabValue[] } {
  const p = samplePatient()
  const latestByName = Object.fromEntries(S.values_latest.map((v) => [v.test, v]))
  const reports: Report[] = []
  const values: LabValue[] = []
  for (const rep of S.reports.slice(1)) {
    reports.push({ id: rep.id, patient_id: p.id, report_date: rep.date, lab_name: rep.lab, source_type: 'sample', status: 'confirmed', sample: true })
    const ctx = { sex: p.sex, age: ageOn(p.birth_year, rep.date), report_id: rep.id, patient_id: p.id, report_date: rep.date }
    for (const [name, series] of Object.entries(S.trends)) {
      const pt = series.find((x) => x.date === rep.date)
      if (!pt) continue
      const ref = latestByName[name]
      values.push(analyseRow({ ...rowFromSample(ref), raw_name: name, value_num: pt.v }, ctx, `${rep.id}-${name}`))
    }
  }
  return { reports, values }
}

/** The latest report, as the extraction step would return it (goes through
 *  the confirm screen). Includes one row the matcher cannot recognise. */
export function sampleLatest(opts: { partial?: boolean } = {}): { report: Report; values: LabValue[] } {
  const p = samplePatient()
  const rep = S.reports[0]
  const report: Report = { id: rep.id, patient_id: p.id, report_date: rep.date, lab_name: rep.lab, source_type: 'sample', status: 'parsed', sample: true }
  const ctx = { sex: p.sex, age: ageOn(p.birth_year, rep.date), report_id: rep.id, patient_id: p.id, report_date: rep.date }
  let rows: RowInput[] = [
    ...S.values_latest.map(rowFromSample),
    { raw_name: 'Homocysteine', value_num: 14.2, unit: 'µmol/L', ref_low: 5, ref_high: 15, has_range: true },
  ]
  if (opts.partial) {
    // What a failed layout typically recovers: a few rows, some without ranges.
    rows = rows.slice(0, 5).map((r, i) => (i % 2 ? { ...r, ref_low: null, ref_high: null, has_range: false } : r))
    report.status = 'parse_failed'
  }
  return { report, values: rows.map((r, i) => analyseRow(r, ctx, `${rep.id}-v${i}`)) }
}
