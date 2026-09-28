import { TEST_BY_ID, fallbackRange, toRowUnit, type CatalogTest } from './catalog'
import { classify, classifyQualitative } from './classify'
import { isAutoMatched, matchName } from './normalise'
import type { LabValue, RefSource, Sex } from './types'
import { uid } from './util'

/** Mirrors api/app/pipeline/analyse.py. Used for the mock adapter and for
 *  live re-classification while the user edits the confirm screen. */
export interface RowInput {
  raw_name: string
  value_num?: number | null
  value_text?: string | null
  unit?: string | null
  ref_low?: number | null
  ref_high?: number | null
  ref_text?: string | null
  has_range?: boolean
  test_id?: string | null // user override
}

export interface Ctx {
  sex: Sex
  age: number
  report_id: string
  patient_id: string
  report_date: string
}

export function analyseRow(row: RowInput, ctx: Ctx, id?: string): LabValue {
  let testId: string | null
  let method: LabValue['match_method']
  let conf: number
  let auto: boolean
  if (row.test_id && TEST_BY_ID[row.test_id]) {
    testId = row.test_id; method = 'user'; conf = 1; auto = false
  } else {
    const m = matchName(row.raw_name)
    testId = m.testId; method = m.method; conf = m.confidence; auto = isAutoMatched(row.raw_name, m)
  }
  const base = {
    id: id ?? uid(),
    report_id: ctx.report_id,
    patient_id: ctx.patient_id,
    report_date: ctx.report_date,
    raw_name: row.raw_name,
    value_num: row.value_num ?? null,
    value_text: row.value_text ?? null,
    unit: row.unit ?? null,
    match_method: method,
    match_conf: conf,
    auto_matched: auto,
  }
  if (!testId) {
    return {
      ...base, test_id: null, name: row.raw_name, loinc: null, panel: null,
      ref_low: row.ref_low ?? null, ref_high: row.ref_high ?? null, expected: row.ref_text ?? null,
      ref_source: row.has_range ? 'report' : 'none', ref_band: null, crit_low: null, crit_high: null,
      status: 'unrecognised', deviation: 0, included: false,
    }
  }
  const t = TEST_BY_ID[testId]
  const unit = row.unit || t.unit || null
  const common = { ...base, test_id: t.id, name: t.name, loinc: t.loinc, panel: t.panel, unit, decimals: t.decimals, included: true }

  if (t.kind === 'qualitative' || (row.value_num == null && row.value_text)) {
    const expected = row.ref_text || t.expected || 'Negative'
    const { status, deviation } = classifyQualitative(row.value_text ?? '', expected)
    return {
      ...common, ref_low: null, ref_high: null, expected,
      ref_source: row.ref_text ? 'report' : 'catalog', ref_band: null, crit_low: null, crit_high: null, status, deviation,
    }
  }

  let low: number | null = null
  let high: number | null = null
  let source: RefSource = 'none'
  let band: LabValue['ref_band'] = null
  if (row.has_range && (row.ref_low != null || row.ref_high != null)) {
    low = row.ref_low ?? null; high = row.ref_high ?? null; source = 'report'
  } else {
    let r = fallbackRange(t, ctx.sex, ctx.age)
    if (r && unit && toRowUnit(t, unit, 1) == null) r = null
    if (r) {
      low = toRowUnit(t, unit, r.low); high = toRowUnit(t, unit, r.high); source = 'catalog'
      band = { sex: r.sex, age_min: r.age_min, age_max: r.age_max }
    }
  }
  const critLow = toRowUnit(t, unit, t.critLow)
  const critHigh = toRowUnit(t, unit, t.critHigh)
  const implausible = isImplausible(t, unit, row.value_num ?? null)
  // An impossible number (Hb 104 from a dropped decimal point) is a reading or
  // typing error: ask the user to check it, never raise an alarm.
  const res = row.value_num == null || implausible ? { status: 'unknown' as const, deviation: 0 } : classify(row.value_num, low, high, critLow, critHigh)
  return {
    ...common, ref_low: low, ref_high: high, expected: null, ref_source: source, ref_band: band,
    crit_low: critLow, crit_high: critHigh, status: res.status, deviation: res.deviation, implausible,
  }
}

export function isImplausible(t: CatalogTest, unit: string | null, value: number | null): boolean {
  if (value == null || !t.plausible) return false
  const lo = toRowUnit(t, unit, t.plausible[0])
  const hi = toRowUnit(t, unit, t.plausible[1])
  if (lo == null || hi == null) return false // unknown unit: cannot judge
  return value < lo || value > hi
}

/** Rebuild the RowInput a value came from, so an edit can be re-analysed. */
export function toRowInput(v: LabValue): RowInput {
  const printed = v.ref_source === 'report'
  return {
    raw_name: v.raw_name,
    value_num: v.value_num,
    value_text: v.value_text,
    unit: v.unit,
    ref_low: printed ? v.ref_low : null,
    ref_high: printed ? v.ref_high : null,
    ref_text: printed ? v.expected : null,
    has_range: printed && (v.ref_low != null || v.ref_high != null),
    test_id: v.match_method === 'user' ? v.test_id : null,
  }
}
