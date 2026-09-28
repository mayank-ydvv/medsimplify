import { PencilLine, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EmptyPeopleArt, EmptyTrendsArt, ErrorArt, PrivacyArt } from '../illustrations'
import { useI18n } from '../lib/i18n'
import { setJob, useStore } from '../lib/store'

const ART = { trends: EmptyTrendsArt, people: EmptyPeopleArt, error: ErrorArt, privacy: PrivacyArt }

/** Empty state: line-art illustration + one sentence + one clear action. */
export function EmptyState({ art, title, body, action }: { art: keyof typeof ART; title: string; body?: string; action?: ReactNode }) {
  const Art = ART[art]
  return (
    <section className="empty card">
      <Art className="empty-art" />
      <h2 className="h3">{title}</h2>
      {body && <p className="muted">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </section>
  )
}

/** What failed, in plain language, plus retry and a manual-entry escape hatch.
 *  Never a stack trace or a bare error code. */
export function ErrorScreen() {
  const { t } = useI18n()
  const loc = useLocation()
  const nav = useNavigate()
  const { activePatient } = useStore()
  const kind = (loc.state as { kind?: string } | null)?.kind
  const body = kind === 'network' ? t('error.network') : t('error.body')
  return (
    <div className="page error-page">
      <section className="empty card" role="alert" aria-labelledby="err-title">
        <ErrorArt className="empty-art" />
        <h1 id="err-title" className="h3">{t('error.title')}</h1>
        <p className="muted">{body}</p>
        <div className="empty-action row">
          <button type="button" className="btn btn-primary" onClick={() => nav('/')}>
            <RefreshCw size={18} strokeWidth={1.5} aria-hidden="true" />
            {t('error.retry')}
          </button>
          {activePatient && !activePatient.sample && (
            <button type="button" className="btn btn-secondary" onClick={() => { setJob({ kind: 'manual', patientId: activePatient.id }); nav('/processing') }}>
              <PencilLine size={18} strokeWidth={1.5} aria-hidden="true" />
              {t('error.manual')}
            </button>
          )}
        </div>
        <Link to="/" className="link-btn">{t('error.home')}</Link>
      </section>
    </div>
  )
}
