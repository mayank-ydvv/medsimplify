import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { sampleHistory } from './sample'
import type { Lang, LabValue, Patient, Report } from './types'
import { uid } from './util'

/**
 * App state. Health data (people, reports, values) is written to this
 * device's storage ONLY when the user turned on "Save my results". Language and
 * consent flags are preferences, not health data, and are always remembered.
 */
export interface Consent { analyse: boolean; save: boolean; asked: boolean }

export interface Draft {
  report: Report
  values: LabValue[]
  /** rows exactly as extracted, so only real edits are synced to the server */
  original: LabValue[]
  originalReport: Report
  /** this upload created the server report (false when it matched an existing one) */
  serverCreated?: boolean
  parseFailed: boolean
  manual: boolean
}

export interface Toast { id: string; text: string; tone?: 'success' | 'info' }

export interface State {
  consent: Consent
  lang: Lang
  patients: Patient[]
  activePatientId: string | null
  reports: Report[]
  values: LabValue[]
  draft: Draft | null
  toasts: Toast[]
}

type Action =
  | { type: 'lang'; lang: Lang }
  | { type: 'consent'; consent: Partial<Consent> }
  | { type: 'addPatient'; patient: Patient; activate?: boolean }
  | { type: 'updatePatient'; id: string; patch: Partial<Patient> }
  | { type: 'activate'; id: string }
  | { type: 'editPatient'; patient: Patient; values: LabValue[] }
  | { type: 'deletePatient'; id: string }
  | { type: 'draft'; draft: Draft | null }
  | { type: 'draftValues'; values: LabValue[] }
  | { type: 'draftReport'; report: Report; values: LabValue[] }
  | { type: 'discardDraft' }
  | { type: 'commitDraft' }
  | { type: 'deleteReport'; id: string }
  | { type: 'deleteAll' }
  | { type: 'toast'; toast: Toast }
  | { type: 'dismissToast'; id: string }

const PREFS_KEY = 'medsimplify:prefs:v1'
const DATA_KEY = 'medsimplify:data:v1'
/** The report being checked on the confirm screen. Kept in sessionStorage so a
 *  reload doesn't lose a minute of corrections; it dies with the tab. */
const DRAFT_KEY = 'medsimplify:draft:v1'

export const emptyState: State = {
  consent: { analyse: false, save: false, asked: false },
  lang: 'en',
  patients: [],
  activePatientId: null,
  reports: [],
  values: [],
  draft: null,
  toasts: [],
}

function load(): State {
  const s: State = { ...emptyState }
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    if (prefs) {
      s.lang = prefs.lang ?? 'en'
      s.consent = { ...emptyState.consent, ...prefs.consent }
    }
    if (s.consent.save) {
      const data = JSON.parse(localStorage.getItem(DATA_KEY) ?? 'null')
      if (data) {
        s.patients = data.patients ?? []
        s.reports = data.reports ?? []
        s.values = data.values ?? []
        s.activePatientId = data.activePatientId ?? s.patients[0]?.id ?? null
      }
    }
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as { draft: Draft; patient: Patient | null } | null
    if (saved?.draft) {
      s.draft = saved.draft
      if (saved.patient && !s.patients.some((p) => p.id === saved.patient!.id)) {
        s.patients = [...s.patients, saved.patient]
        s.activePatientId = s.activePatientId ?? saved.patient.id
      }
    }
  } catch {
    /* storage unavailable (private mode, blocked) — run in memory */
  }
  return s
}

export function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'lang':
      return { ...state, lang: a.lang }
    case 'consent':
      return { ...state, consent: { ...state.consent, ...a.consent } }
    case 'addPatient': {
      const exists = state.patients.some((p) => p.id === a.patient.id)
      return {
        ...state,
        patients: exists ? state.patients : [...state.patients, a.patient],
        activePatientId: a.activate || !state.activePatientId ? a.patient.id : state.activePatientId,
      }
    }
    case 'updatePatient':
      return { ...state, patients: state.patients.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) }
    case 'activate':
      return { ...state, activePatientId: a.id }
    case 'editPatient': {
      const ids = new Set(a.values.map((v) => v.id))
      return {
        ...state,
        patients: state.patients.map((p) => (p.id === a.patient.id ? a.patient : p)),
        values: [...state.values.filter((v) => !ids.has(v.id)), ...a.values],
      }
    }
    case 'deletePatient': {
      // Same cascade as ON DELETE CASCADE: the person, their reports, their values.
      const patients = state.patients.filter((p) => p.id !== a.id)
      return {
        ...state,
        patients,
        reports: state.reports.filter((r) => r.patient_id !== a.id),
        values: state.values.filter((v) => v.patient_id !== a.id),
        draft: state.draft?.report.patient_id === a.id ? null : state.draft,
        activePatientId: state.activePatientId === a.id ? patients[0]?.id ?? null : state.activePatientId,
      }
    }
    case 'draft':
      return { ...state, draft: a.draft }
    case 'draftValues':
      return state.draft ? { ...state, draft: { ...state.draft, values: a.values } } : state
    case 'draftReport':
      return state.draft ? { ...state, draft: { ...state.draft, report: a.report, values: a.values } } : state
    case 'discardDraft': {
      if (!state.draft) return state
      // Backing out of the sample must not leave the sample person behind.
      const pid = state.draft.report.patient_id
      const p = state.patients.find((x) => x.id === pid)
      const orphan = p?.sample && !state.reports.some((r) => r.patient_id === pid)
      const patients = orphan ? state.patients.filter((x) => x.id !== pid) : state.patients
      return {
        ...state,
        draft: null,
        patients,
        activePatientId: orphan ? patients[0]?.id ?? null : state.activePatientId,
      }
    }
    case 'commitDraft': {
      if (!state.draft) return state
      const r = { ...state.draft.report, status: 'confirmed' as const }
      // The sample's two older reports are only saved once the user confirms.
      const hist = r.sample ? sampleHistory() : { reports: [], values: [] }
      const have = new Set(state.reports.map((x) => x.id))
      const newHist = hist.reports.filter((x) => !have.has(x.id))
      const newHistIds = new Set(newHist.map((x) => x.id))
      return {
        ...state,
        draft: null,
        activePatientId: r.patient_id,
        reports: [...state.reports.filter((x) => x.id !== r.id), ...newHist, r],
        values: [
          ...state.values.filter((v) => v.report_id !== r.id),
          ...hist.values.filter((v) => newHistIds.has(v.report_id)),
          ...state.draft.values,
        ],
      }
    }
    case 'deleteReport':
      return { ...state, reports: state.reports.filter((r) => r.id !== a.id), values: state.values.filter((v) => v.report_id !== a.id) }
    case 'deleteAll':
      // Consent is withdrawn along with the data, so it is asked again next time.
      return { ...emptyState, lang: state.lang, consent: { analyse: false, save: false, asked: false }, toasts: state.toasts }
    case 'toast':
      return { ...state, toasts: [...state.toasts.slice(-2), a.toast] }
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== a.id) }
  }
}

interface StoreValue {
  state: State
  dispatch: React.Dispatch<Action>
  toast: (text: string, tone?: Toast['tone']) => void
  activePatient: Patient | null
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ lang: state.lang, consent: state.consent }))
      if (state.consent.save) {
        localStorage.setItem(DATA_KEY, JSON.stringify({ patients: state.patients, reports: state.reports, values: state.values, activePatientId: state.activePatientId }))
      } else {
        localStorage.removeItem(DATA_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [state.lang, state.consent, state.patients, state.reports, state.values, state.activePatientId])

  useEffect(() => {
    try {
      if (state.draft) {
        const patient = state.patients.find((p) => p.id === state.draft!.report.patient_id) ?? null
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: state.draft, patient }))
      } else {
        sessionStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [state.draft, state.patients])

  const toast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = uid()
    dispatch({ type: 'toast', toast: { id, text, tone } })
    window.setTimeout(() => dispatch({ type: 'dismissToast', id }), 4200)
  }, [])

  const activePatient = state.patients.find((p) => p.id === state.activePatientId) ?? null
  const value = useMemo(() => ({ state, dispatch, toast, activePatient }), [state, toast, activePatient])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside provider')
  return v
}

/** Pending upload job. Files are not serialisable, so they live here briefly
 *  between the landing page and the processing screen, then are dropped. */
export type Job = { kind: 'sample' } | { kind: 'file'; file: File; patientId: string } | { kind: 'manual'; patientId: string }
let pendingJob: Job | null = null
export const setJob = (j: Job | null) => { pendingJob = j }
export const takeJob = (): Job | null => { const j = pendingJob; pendingJob = null; return j }
export const peekJob = () => pendingJob
