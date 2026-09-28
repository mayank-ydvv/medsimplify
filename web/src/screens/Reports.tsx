import { ChevronRight, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SampleBadge, Skeleton } from '../components/Chrome'
import { StatusIcon, StatusPill } from '../components/Status'
import { STATUS_RANK, isAbnormal, isCritical } from '../lib/classify'
import { useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import { fmtDate } from '../lib/util'
import { EmptyState } from './States'

export default function Reports() {
  const { t } = useI18n()
  const { state, activePatient } = useStore()
  const reports = state.reports
    .filter((r) => r.patient_id === activePatient?.id)
    .sort((a, b) => b.report_date.localeCompare(a.report_date))

  if (!activePatient) {
    return (
      <div className="page">
        <header className="page-head"><h1 className="h2">{t('reports.h2')}</h1></header>
        <EmptyState art="people" title={t('reports.empty')} action={<Link to="/" className="btn btn-primary"><Upload size={18} strokeWidth={1.5} aria-hidden="true" />{t('nav.upload')}</Link>} />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="h2">{t('reports.h2')}</h1>
          <p className="page-sub">{t('reports.sub', { name: activePatient.name })}</p>
        </div>
        {activePatient.sample && <SampleBadge />}
      </header>
      {state.draft && state.draft.report.patient_id === activePatient.id && <Skeleton lines={2} className="card" />}
      {reports.length === 0 ? (
        <EmptyState art="trends" title={t('reports.empty')} action={<Link to="/" className="btn btn-primary"><Upload size={18} strokeWidth={1.5} aria-hidden="true" />{t('nav.upload')}</Link>} />
      ) : (
        <ul className="report-list">
          {reports.map((r) => {
            const vs = state.values.filter((v) => v.report_id === r.id && v.included)
            const flagged = vs.filter((v) => isAbnormal(v.status)).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
            const critical = vs.filter((v) => isCritical(v.status))
            return (
              <li key={r.id}>
                <Link to={`/report/${r.id}`} className="card report-item">
                  <div className="ri-main">
                    <span className="ri-date num">{fmtDate(r.report_date)}</span>
                    <span className="ri-lab">{r.lab_name}</span>
                  </div>
                  <div className="ri-dots" aria-hidden="true">
                    {[...vs].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]).slice(0, 18).map((v) => <StatusIcon key={v.id} status={v.status} size={12} />)}
                  </div>
                  <span className="ri-count num">
                    {t('reports.values', { n: vs.length })}
                    {flagged.length ? ` · ${t('reports.flagged', { n: flagged.length })}` : ''}
                  </span>
                  {critical.length > 0 && (
                    <span className="ri-critical">
                      <StatusPill status="critical_high" size="sm" short />
                      <span className="num">{critical.map((v) => v.name).join(', ')}</span>
                    </span>
                  )}
                  <ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" className="ri-chev" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
