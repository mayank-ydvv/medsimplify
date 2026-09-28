import { Info, Trash } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Overlay'
import { PrivacyArt } from '../illustrations'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Toggle } from './Landing'

const CLAIMS = ['privacy.c1', 'privacy.c2', 'privacy.c3', 'privacy.c4', 'privacy.c5'] as const

export default function Privacy() {
  const { t } = useI18n()
  const { state, dispatch, toast } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const hasData = state.patients.length + state.reports.length > 0

  const wipe = async () => {
    await Promise.all(state.patients.map((p) => api.deletePatient(p)))
    dispatch({ type: 'deleteAll' })
    try {
      localStorage.removeItem('medsimplify:data:v1')
      sessionStorage.clear()
    } catch { /* ignore */ }
    setOpen(false)
    setTyped('')
    toast(t('privacy.deleted'))
    nav('/')
  }

  return (
    <div className="page privacy">
      <header className="page-head">
        <div>
          <h1 className="h2">{t('privacy.h2')}</h1>
          <p className="page-sub">{t('privacy.sub')}</p>
        </div>
        <PrivacyArt className="privacy-art" />
      </header>

      <ul className="claims card">
        {CLAIMS.map((k) => (
          <li key={k} className="claim">
            <svg className="claim-check" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" fill="var(--green-050)" stroke="var(--green-500)" strokeWidth="1.5" />
              <path d="m7.5 12.4 3 3 6-6.6" fill="none" stroke="var(--green-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p>{t(k)}</p>
          </li>
        ))}
      </ul>

      <p className="notice proto-note">
        <Info size={20} strokeWidth={1.5} aria-hidden="true" />
        <span>{t('privacy.proto_note')}</span>
      </p>

      <section className="card store-card" aria-labelledby="stored-title">
        <h2 id="stored-title" className="h3">{t('privacy.stored_now')}</h2>
        <p className="num stored-counts">
          {hasData ? t('privacy.stored_counts', { p: state.patients.length, r: state.reports.length, v: state.values.length }) : t('privacy.nothing')}
        </p>
        <Toggle
          id="save-toggle"
          checked={state.consent.save}
          onChange={(v) => dispatch({ type: 'consent', consent: { save: v, asked: true } })}
          label={t('privacy.toggle_save')}
          hint={state.consent.save ? t('privacy.saving_on') : t('privacy.saving_off')}
        />
      </section>

      <div className="danger-zone">
        <button type="button" className="btn btn-danger-outline btn-lg" onClick={() => setOpen(true)} disabled={!hasData}>
          <Trash size={20} strokeWidth={1.5} aria-hidden="true" />
          {t('privacy.delete_all')}
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setTyped('') }}
        title={t('privacy.delete_title')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setOpen(false); setTyped('') }}>{t('results.cancel')}</button>
            <button type="button" className="btn btn-danger" disabled={typed.trim() !== 'DELETE'} onClick={wipe}>{t('privacy.delete_go')}</button>
          </>
        }
      >
        <p>{t('privacy.delete_body')}</p>
        <div className="field">
          <label htmlFor={inputId} className="field-label">{t('privacy.delete_type')}</label>
          <input id={inputId} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-autofocus />
        </div>
      </Modal>
    </div>
  )
}
