import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError, runSample, uploadFile, type Stage } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { samplePatient } from '../lib/sample'
import { peekJob, takeJob, useStore, type Job } from '../lib/store'
import type { Report } from '../lib/types'
import { cx, uid } from '../lib/util'

const STEPS = ['proc.step1', 'proc.step2', 'proc.step3', 'proc.step4', 'proc.step5'] as const
const MICRO = ['proc.micro1', 'proc.micro2', 'proc.micro3', 'proc.micro4', 'proc.micro5', 'proc.micro6'] as const
const SLOW_MS = 8000

export default function Processing() {
  const { t } = useI18n()
  const { state, dispatch, toast } = useStore()
  const nav = useNavigate()
  const jobRef = useRef<Job | null>(peekJob())
  const started = useRef(false)
  const [stage, setStage] = useState<Stage>(0)
  const [micro, setMicro] = useState(0)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setMicro((m) => (m + 1) % MICRO.length), 1300)
    const slowId = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => { window.clearInterval(id); window.clearTimeout(slowId) }
  }, [])

  useEffect(() => {
    if (started.current || !jobRef.current) return
    started.current = true
    const job = takeJob() ?? jobRef.current
    ;(async () => {
      try {
        if (job.kind === 'sample') {
          const res = await runSample(setStage)
          // Only the person is added now; the sample's older reports are saved
          // on "Looks right", so backing out leaves nothing behind.
          dispatch({ type: 'addPatient', patient: samplePatient(), activate: true })
          dispatch({ type: 'draft', draft: { report: res.report, values: res.values, original: res.values, originalReport: res.report, parseFailed: res.status === 'parse_failed', manual: false } })
        } else if (job.kind === 'file') {
          const person = state.patients.find((p) => p.id === job.patientId)
          // Real reports never go into the illustrative sample profile.
          if (!person || person.sample) throw new ApiError('rejected', 'no patient')
          dispatch({ type: 'activate', id: person.id })
          const res = await uploadFile(job.file, person, setStage)
          dispatch({ type: 'updatePatient', id: person.id, patch: { server_id: res.serverPatientId } })
          if (res.status === 'duplicate') {
            const saved = state.reports.find((r) => r.server_id === res.report.server_id)
            if (saved) {
              toast(t('toast.duplicate'), 'info')
              nav(`/report/${saved.id}`, { replace: true })
              return
            }
          }
          dispatch({ type: 'draft', draft: { report: res.report, values: res.values, original: res.values, originalReport: res.report, serverCreated: res.status !== 'duplicate', parseFailed: res.status === 'parse_failed', manual: false } })
        } else {
          const person = state.patients.find((p) => p.id === job.patientId)
          if (!person || person.sample) throw new ApiError('rejected', 'no patient')
          dispatch({ type: 'activate', id: person.id })
          const report: Report = { id: uid(), patient_id: person.id, report_date: new Date().toISOString().slice(0, 10), lab_name: 'Entered manually', source_type: 'manual', status: 'parsed' }
          dispatch({ type: 'draft', draft: { report, values: [], original: [], originalReport: report, parseFailed: false, manual: true } })
        }
        nav('/confirm', { replace: true })
      } catch (e) {
        nav('/error', { replace: true, state: { kind: e instanceof ApiError ? e.kind : 'server', job: job.kind } })
      }
    })()
    // runs once per job; the store snapshot at start is what the job needs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!jobRef.current) return <Navigate to="/" replace />

  const pct = Math.min(100, (stage / STEPS.length) * 100)

  return (
    <div className="processing">
      <section className="card proc-card" aria-labelledby="proc-title">
        <h1 id="proc-title" className="h2">{t('proc.title')}</h1>
        <ol className="stepper">
          {STEPS.map((key, i) => {
            const state = i < stage ? 'done' : i === stage ? 'active' : 'todo'
            return (
              <li key={key} className={cx('step', state)} aria-current={state === 'active' ? 'step' : undefined}>
                <span className="step-dot" aria-hidden="true">
                  {state === 'done' ? (
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="m3.5 8.3 3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : state === 'active' ? <span className="step-pulse" /> : null}
                </span>
                <span className="step-label">{t(key)}</span>
                <span className="sr-only">
                  {' — '}{state === 'done' ? t('proc.done') : state === 'active' ? t('proc.in_progress') : t('proc.waiting')}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="progress" role="progressbar" aria-label={t('proc.title')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <span className="progress-indeterminate" />
        </div>
        <p className="micro" aria-hidden="true" key={micro}>{t(MICRO[micro])}</p>
        <p className="sr-only" aria-live="polite">{stage < 5 ? t(STEPS[stage as 0 | 1 | 2 | 3 | 4]) : t('proc.done')}</p>
        {slow && <p className="slow-note" role="status">{t('proc.slow')}</p>}
      </section>
    </div>
  )
}
