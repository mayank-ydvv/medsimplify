import { ArrowRight, Download, FileLock, FileUp, ShieldCheck, Stethoscope, Trash } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Modal } from '../components/Overlay'
import { PersonForm } from '../components/PersonForm'
import { EcgDivider, EcgLine, HeroDocument } from '../illustrations'
import { useI18n } from '../lib/i18n'
import { setJob, useStore } from '../lib/store'
import type { Patient } from '../lib/types'
import { ageOn } from '../lib/util'
import { Avatar } from '../components/Layout'
import { cx } from '../lib/util'

const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
const MAX_BYTES = 15 * 1024 * 1024

export default function Landing() {
  const { t } = useI18n()
  const { state, dispatch, activePatient } = useStore()
  const nav = useNavigate()
  const [drag, setDrag] = useState(false)
  const [fileError, setFileError] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [whoOpen, setWhoOpen] = useState(false)
  const [analyse, setAnalyse] = useState(false)
  const [save, setSave] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const errId = useId()
  const consentDesc = useId()

  // Real people only: reports never go into the illustrative sample profile.
  const people = state.patients.filter((p) => !p.sample)

  const go = (job: Pending) => {
    if (job.kind === 'file') {
      // Always confirm who the report is for; ranges depend on age and sex, and
      // a report filed under the wrong person corrupts both people's trends.
      setPending(job)
      setWhoOpen(true)
      return
    }
    setJob(job)
    nav('/processing')
  }

  const startFor = (patientId: string) => {
    if (pending?.kind !== 'file') return
    setWhoOpen(false)
    setJob({ kind: 'file', file: pending.file, patientId })
    setPending(null)
    nav('/processing')
  }

  const start = (job: Pending) => {
    if (!state.consent.asked || !state.consent.analyse) {
      setPending(job)
      setAnalyse(false)
      setSave(false)
      setConsentOpen(true)
      return
    }
    go(job)
  }

  const takeFile = (file: File | undefined) => {
    setFileError('')
    if (!file) return
    const okType = ACCEPT.includes(file.type) || /\.(pdf|jpe?g|png|heic|webp)$/i.test(file.name)
    if (!okType) return setFileError(t('landing.bad_type'))
    if (file.size > MAX_BYTES) return setFileError(t('landing.too_big'))
    start({ kind: 'file', file })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    takeFile(e.dataTransfer.files?.[0])
  }

  const trySamplePdf = async () => {
    try {
      const res = await fetch('/sample-lab-report.pdf')
      const blob = await res.blob()
      takeFile(new File([blob], 'sample-lab-report.pdf', { type: 'application/pdf' }))
    } catch {
      setFileError(t('error.network'))
    }
  }

  const hasReports = state.reports.length > 0

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <EcgLine className="hero-ecg" animate />
        <span className="chip chip-green">
          <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" />
          {t('landing.chip')}
        </span>
        <h1 id="hero-title">{t('landing.h1')}</h1>
        <p className="hero-sub">{t('landing.sub')}</p>

        <div
          className={cx('dropzone', drag && 'is-drag')}
          onDragEnter={(e) => { e.preventDefault(); setDrag(true) }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDrag(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false) }}
          onDrop={onDrop}
        >
          <HeroDocument className="drop-art" />
          <p className="drop-title">
            {drag ? t('landing.drop_active') : (
              <>
                {t('landing.drop')}{' '}
                <button type="button" className="link-inline" onClick={() => inputRef.current?.click()} aria-describedby={`${hintId} ${fileError ? errId : ''}`}>
                  {t('landing.browse')}
                </button>
              </>
            )}
          </p>
          <p id={hintId} className="drop-hint">{t('landing.drop_hint')}</p>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*"
            onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }}
            aria-hidden="true"
          />
          <button type="button" className="btn btn-primary drop-btn" onClick={() => inputRef.current?.click()}>
            <FileUp size={20} strokeWidth={1.5} aria-hidden="true" />
            {t('nav.upload')}
          </button>
          {fileError && <p id={errId} className="field-error" role="alert">{fileError}</p>}
        </div>

        <div className="hero-actions">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => start({ kind: 'sample' })}>
            {t('landing.sample')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={trySamplePdf}>
            {t('landing.sample_pdf')}
          </button>
          <a className="link-btn" href="/sample-lab-report.pdf" download>
            <Download size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">{t('landing.sample_pdf_hint')}</span>
            <span aria-hidden="true">PDF</span>
          </a>
        </div>
        {hasReports && (
          <Link to="/reports" className="continue-link">
            {t('landing.continue')} <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        )}
      </section>

      <EcgDivider />

      <section className="trust" aria-labelledby="trust-title">
        <h2 id="trust-title" className="sr-only">{t('landing.trust_title')}</h2>
        <ul className="trust-grid">
          <li className="trust-item">
            <span className="trust-icon"><FileLock size={24} strokeWidth={1.5} aria-hidden="true" /></span>
            <h3>{t('landing.trust1_t')}</h3>
            <p>{t('landing.trust1_d')}</p>
          </li>
          <li className="trust-item">
            <span className="trust-icon"><Trash size={24} strokeWidth={1.5} aria-hidden="true" /></span>
            <h3>{t('landing.trust2_t')}</h3>
            <p>{t('landing.trust2_d')}</p>
          </li>
          <li className="trust-item">
            <span className="trust-icon"><Stethoscope size={24} strokeWidth={1.5} aria-hidden="true" /></span>
            <h3>{t('landing.trust3_t')}</h3>
            <p>{t('landing.trust3_d')}</p>
          </li>
        </ul>
      </section>

      <Modal
        open={consentOpen}
        onClose={() => { setConsentOpen(false); setPending(null) }}
        title={t('consent.title')}
        describedBy={consentDesc}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setConsentOpen(false); setPending(null) }}>{t('consent.cancel')}</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!analyse}
              aria-describedby={!analyse ? 'consent-need' : undefined}
              onClick={() => {
                dispatch({ type: 'consent', consent: { analyse: true, save, asked: true } })
                setConsentOpen(false)
                if (pending) go(pending)
              }}
            >
              {t('consent.continue')}
            </button>
          </>
        }
      >
        <ul id={consentDesc} className="consent-notice">
          <li>{t('consent.purpose')}</li>
          <li>{t('consent.stored')}</li>
          <li>{t('consent.retention')}</li>
          <li>{t('consent.withdraw')}</li>
        </ul>
        <div className="toggles">
          <Toggle id="c-analyse" checked={analyse} onChange={setAnalyse} label={t('consent.analyse')} hint={t('consent.analyse_hint')} />
          <Toggle id="c-save" checked={save} onChange={setSave} label={t('consent.save')} hint={t('consent.save_hint')} />
        </div>
        {!analyse && <p id="consent-need" className="field-hint">{t('consent.need_first')}</p>}
      </Modal>

      <Modal open={whoOpen} onClose={() => { setWhoOpen(false); setPending(null) }} title={t('who.title')}>
        <WhoChooser
          people={people}
          defaultId={activePatient && !activePatient.sample ? activePatient.id : people[0]?.id ?? null}
          showSampleNote={state.patients.some((p) => p.sample)}
          onCancel={() => { setWhoOpen(false); setPending(null) }}
          onChoose={startFor}
          onCreate={(p) => {
            dispatch({ type: 'addPatient', patient: p, activate: true })
            startFor(p.id)
          }}
        />
      </Modal>
    </div>
  )
}

type Pending = { kind: 'sample' } | { kind: 'file'; file: File }

function WhoChooser({ people, defaultId, showSampleNote, onChoose, onCreate, onCancel }: {
  people: Patient[]
  defaultId: string | null
  showSampleNote: boolean
  onChoose: (id: string) => void
  onCreate: (p: Patient) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [choice, setChoice] = useState<string>(defaultId ?? '__new')
  return (
    <div className="who">
      <p className="modal-sub">{t('who.sub')}</p>
      {people.length > 0 && (
        <fieldset className="who-list">
          <legend className="sr-only">{t('who.title')}</legend>
          {people.map((p) => (
            <label key={p.id} className="who-opt">
              <input type="radio" name="who" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} data-autofocus={choice === p.id || undefined} />
              <Avatar name={p.name} size="sm" />
              <span className="who-name">{p.name}</span>
              <span className="who-meta num">{t('people.age', { age: ageOn(p.birth_year) })} · {t(`results.sex.${p.sex}`)}</span>
            </label>
          ))}
          <label className="who-opt">
            <input type="radio" name="who" value="__new" checked={choice === '__new'} onChange={() => setChoice('__new')} />
            <span className="who-plus" aria-hidden="true">+</span>
            <span className="who-name">{t('who.new')}</span>
          </label>
        </fieldset>
      )}
      {showSampleNote && <p className="field-hint">{t('who.sample_note')}</p>}
      {choice === '__new' ? (
        <PersonForm submitLabel={t('consent.continue')} onCancel={onCancel} onSave={onCreate} />
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('people.cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => onChoose(choice)}>{t('consent.continue')}</button>
        </div>
      )}
    </div>
  )
}

export function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="toggle-row">
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id} className="toggle-label">
        <span className="toggle-title">{label}</span>
        {hint && <span id={`${id}-hint`} className="toggle-hint">{hint}</span>}
      </label>
    </div>
  )
}
