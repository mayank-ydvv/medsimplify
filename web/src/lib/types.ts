export type Status =
  | 'critical_low'
  | 'low'
  | 'borderline_low'
  | 'normal'
  | 'borderline_high'
  | 'high'
  | 'critical_high'
  | 'unknown'
  | 'unrecognised'

/** The four visual levels. Status is never colour alone: level -> colour + word + shape. */
export type Level = 'normal' | 'borderline' | 'abnormal' | 'critical' | 'unknown'

export type Sex = 'F' | 'M'
export type Lang = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr'
export type RefSource = 'report' | 'catalog' | 'none'
export type PanelId = 'cbc' | 'liver' | 'kidney' | 'thyroid' | 'lipids' | 'diabetes' | 'vitamins' | 'inflammation' | 'urine'

export interface Patient {
  id: string
  name: string
  sex: Sex
  birth_year: number
  created_at: string
  sample?: boolean
  server_id?: string
}

export interface Report {
  id: string
  patient_id: string
  report_date: string
  lab_name: string
  source_type: 'digital' | 'scan' | 'manual' | 'sample' | 'unknown'
  status: 'parsed' | 'parse_failed' | 'confirmed'
  parse_notes?: { unread?: string[]; date_found?: boolean } & Record<string, unknown>
  sample?: boolean
  server_id?: string
}

export interface RefBand {
  sex: 'F' | 'M' | '*'
  age_min: number
  age_max: number
}

/** One row of a report: the same shape the API returns for report_values. */
export interface LabValue {
  id: string
  report_id: string
  patient_id: string
  report_date: string
  raw_name: string
  test_id: string | null
  name: string
  loinc: string | null
  panel: PanelId | null
  value_num: number | null
  value_text: string | null
  unit: string | null
  ref_low: number | null
  ref_high: number | null
  expected: string | null
  ref_source: RefSource
  ref_band: RefBand | null
  crit_low: number | null
  crit_high: number | null
  status: Status
  deviation: number
  match_method: 'exact' | 'alias' | 'fuzzy' | 'unmatched' | 'user'
  match_conf: number
  auto_matched: boolean
  included: boolean
  decimals?: number
  user_corrected?: boolean
  server_id?: string
  /** value is outside what the test can physically measure: likely a misread */
  implausible?: boolean
}

export interface Explanation {
  what_it_measures: string
  what_yours_means: string
  common_causes: string[]
  ask_your_doctor: string[]
  source: 'static' | 'static_generic' | 'model'
}
