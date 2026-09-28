import { isDemo } from './demo'
import { sampleLatest } from './sample'
import type { LabValue, Patient, Report } from './types'
import { sleep } from './util'

/**
 * Client for the MedSimplify API contract (see api/app/main.py).
 * - The sample report runs through a mock adapter that uses the same
 *   deterministic pipeline in TypeScript.
 * - Real files go to the FastAPI service at VITE_API_URL (default :8000).
 *   PDF parsing only happens server-side; if it is unreachable the UI shows
 *   the Error state with a manual-entry escape hatch.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 // index of the step in progress; 5 = all done

export interface UploadResult {
  report: Report
  values: LabValue[]
  status: 'parsed' | 'parse_failed' | 'duplicate'
  notes?: Record<string, unknown>
}

export class ApiError extends Error {
  constructor(public kind: 'network' | 'server' | 'rejected', message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { 'X-User-Id': 'demo-user', ...(init.headers ?? {}) } })
  } catch {
    throw new ApiError('network', 'unreachable')
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* ignore */ }
    throw new ApiError(res.status >= 500 ? 'server' : 'rejected', typeof detail === 'string' ? detail : '')
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

async function ensureServerPatient(p: Patient): Promise<string> {
  if (p.server_id) return p.server_id
  const created = await request<{ id: string }>('/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: p.name, sex: p.sex, birth_year: p.birth_year }),
  })
  return created.id
}

/** Run the pipeline for a real file via the API. Stages animate while the one
 *  synchronous request is in flight, then complete when it returns. */
export async function uploadFile(file: File, patient: Patient, onStage: (s: Stage) => void): Promise<UploadResult & { serverPatientId: string }> {
  if (isDemo('error')) {
    onStage(0)
    await sleep(900)
    throw new ApiError('server', 'demo')
  }
  onStage(0)
  const serverPatientId = await ensureServerPatient(patient)
  const form = new FormData()
  form.append('file', file)
  form.append('patient_id', serverPatientId)
  let stage: Stage = 0
  const tick = setInterval(() => {
    if (stage < 2) onStage((stage = (stage + 1) as Stage))
  }, 700)
  try {
    const res = await request<{ report: Report & { lab_name: string }; rows: LabValue[]; status: 'parsed' | 'parse_failed' | 'duplicate' }>('/reports/upload', { method: 'POST', body: form })
    clearInterval(tick)
    for (const s of [3, 4, 5] as Stage[]) {
      onStage(s)
      await sleep(isDemo('slow') ? 2000 : 280)
    }
    const report: Report = { ...res.report, id: res.report.id, patient_id: patient.id, server_id: res.report.id }
    const values = res.rows.map((v) => ({ ...v, patient_id: patient.id, server_id: v.id }))
    return { report, values, status: res.status, notes: res.report.parse_notes, serverPatientId }
  } finally {
    clearInterval(tick)
  }
}

/** The sample report through the same stages, driven by real awaits. */
export async function runSample(onStage: (s: Stage) => void): Promise<UploadResult> {
  const per = isDemo('slow') ? 2100 : 480
  for (const s of [0, 1, 2, 3, 4] as Stage[]) {
    onStage(s)
    await sleep(per)
    if (isDemo('error') && s === 1) throw new ApiError('server', 'demo')
  }
  onStage(5)
  const partial = isDemo('parse-fail')
  const { report, values } = sampleLatest({ partial })
  return { report, values, status: partial ? 'parse_failed' : 'parsed' }
}

const PATCHABLE = ['raw_name', 'value_num', 'value_text', 'unit'] as const
const sameRange = (a: LabValue, b: LabValue) =>
  a.ref_source === b.ref_source && a.ref_low === b.ref_low && a.ref_high === b.ref_high && a.expected === b.expected

/** Body for PATCH /reports/{id}/values/{vid}: ONLY what the user changed.
 *  Sending unchanged range fields would make the server treat a catalog range
 *  as "printed on your report". */
export function valuePatch(before: LabValue, after: LabValue): Record<string, unknown> | null {
  const body: Record<string, unknown> = {}
  for (const k of PATCHABLE) if (before[k] !== after[k]) body[k] = after[k]
  if (after.match_method === 'user' && after.test_id !== before.test_id) body.test_id = after.test_id
  if (!sameRange(before, after)) {
    if (after.ref_source === 'report') {
      body.ref_low = after.ref_low
      body.ref_high = after.ref_high
    } else {
      body.clear_ref = true
    }
  }
  return Object.keys(body).length ? body : null
}

/** Push confirm-screen edits to the server: changed rows, added rows, removed
 *  rows, and the report date/lab. No-op for sample or offline-only reports. */
export async function syncDraft(report: Report, original: LabValue[], values: LabValue[], originalReport: Report) {
  const rid = report.server_id
  if (!rid) return
  const before = new Map(original.map((v) => [v.id, v]))
  const now = new Set(values.map((v) => v.id))
  const jobs: Promise<unknown>[] = []
  const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (report.report_date !== originalReport.report_date || report.lab_name !== originalReport.lab_name) {
    jobs.push(request(`/reports/${rid}`, json('PATCH', { report_date: report.report_date, lab_name: report.lab_name })))
  }
  for (const v of values) {
    const b = before.get(v.id)
    if (b?.server_id) {
      const body = valuePatch(b, v)
      if (body) jobs.push(request(`/reports/${rid}/values/${b.server_id}`, json('PATCH', body)))
    } else if (!b) {
      jobs.push(request(`/reports/${rid}/values`, json('POST', {
        raw_name: v.raw_name, value_num: v.value_num, value_text: v.value_text, unit: v.unit,
        ref_low: v.ref_source === 'report' ? v.ref_low : null, ref_high: v.ref_source === 'report' ? v.ref_high : null,
        test_id: v.match_method === 'user' ? v.test_id : null,
      })))
    }
  }
  for (const b of original) {
    if (b.server_id && !now.has(b.id)) jobs.push(request(`/reports/${rid}/values/${b.server_id}`, { method: 'DELETE' }))
  }
  await Promise.allSettled(jobs)
}

/** Contract calls used after confirmation. No-ops for local/sample data. */
export const api = {
  async deleteReport(r: Report) {
    if (!r.server_id) return
    await request(`/reports/${r.server_id}`, { method: 'DELETE' }).catch(() => undefined)
  },
  async updatePatient(p: Patient) {
    if (!p.server_id) return
    await request(`/patients/${p.server_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: p.name, sex: p.sex, birth_year: p.birth_year }),
    }).catch(() => undefined)
  },
  async deletePatient(p: Patient) {
    if (!p.server_id) return
    await request(`/patients/${p.server_id}`, { method: 'DELETE' }).catch(() => undefined)
  },
}
