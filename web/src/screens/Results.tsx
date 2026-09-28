import { CircleAlert, Download, EllipsisVertical, Pause, Play, Square, Trash, Volume2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CriticalBanner, Disclaimer, SampleBadge } from '../components/Chrome'
import { Avatar, LanguageSelect } from '../components/Layout'
import { Menu } from '../components/Menu'
import { Modal } from '../components/Overlay'
import { PanelCard, usePanelSummary } from '../components/PanelCard'
import { DetailDrawer } from '../components/DetailDrawer'
import { rangeLabel } from '../components/RangeBar'
import { StatusIcon, useStatusWord } from '../components/Status'
import { EmptyState } from './States'
import { api } from '../lib/api'
import { PANELS } from '../lib/catalog'
import { STATUS_RANK, isAbnormal, isCritical, levelOf } from '../lib/classify'
import { LANGS, explain, panelName, useI18n } from '../lib/i18n'
import { useSpeech } from '../lib/speech'
import { useStore } from '../lib/store'
import type { LabValue, PanelId } from '../lib/types'
import { ageOn, cx, fmtDate, fmtValue } from '../lib/util'

export default function Results() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const { state, dispatch, toast } = useStore()
  const nav = useNavigate()
  const summary = usePanelSummary()
  const word = useStatusWord()
  const [detail, setDetail] = useState<LabValue | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const report = state.reports.find((r) => r.id === id)
  const patient = state.patients.find((p) => p.id === report?.patient_id)
  const values = useMemo(() => state.values.filter((v) => v.report_id === id), [state.values, id])
  const included = values.filter((v) => v.included)
  const critical = included.filter((v) => isCritical(v.status))

  const panels = useMemo(() => {
    const groups = PANELS.map((p) => ({ id: p.id, values: included.filter((v) => v.panel === p.id) })).filter((g) => g.values.length)
    const worst = (vs: LabValue[]) => Math.min(...vs.map((v) => STATUS_RANK[v.status]))
    return groups.sort((a, b) => worst(a.values) - worst(b.values))
  }, [included])

  const counts = {
    total: included.length,
    within: included.filter((v) => v.status === 'normal').length,
    attention: included.filter((v) => isAbnormal(v.status) && !isCritical(v.status)).length,
    prompt: critical.length,
  }

  const lines = useMemo(() => {
    if (!report) return []
    const out = [t('results.summary_voice', { date: fmtDate(report.report_date) })]
    if (critical.length) {
      out.push(`${critical.length > 1 ? t('results.critical_banner_many') : t('results.critical_banner')} ${critical.map((v) => `${v.name}: ${fmtValue(v.value_num, v.decimals)} ${v.unit ?? ''}`).join('. ')}.`)
    }
    for (const g of panels) out.push(`${panelName(lang, g.id)}. ${summary(g.values)}`)
    out.push(t('disclaimer'))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, panels, critical, lang, t])
  const locale = LANGS.find((l) => l.code === lang)?.speech ?? 'en-IN'
  const speech = useSpeech(lines, locale)

  if (!report || !patient) {
    return (
      <div className="page">
        <EmptyState art="error" title={t('results.not_found')} action={<Link to="/reports" className="btn btn-primary">{t('results.back_reports')}</Link>} />
      </div>
    )
  }

  // the drawer's focus trap returns focus to the row that opened it
  const open = (v: LabValue) => setDetail(v)

  const doDelete = () => {
    void api.deleteReport(report)
    dispatch({ type: 'deleteReport', id: report.id })
    setConfirmDelete(false)
    toast(t('results.deleted'))
    nav('/reports')
  }

  const age = ageOn(patient.birth_year, report.report_date)
  const excluded = values.filter((v) => !v.included)
  const flagged = [...included].filter((v) => isAbnormal(v.status)).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])

  return (
    <div className="results page">
      <header className="results-head card">
        <div className="rh-person">
          <Avatar name={patient.name} size="lg" />
          <div>
            <p className="rh-label">{t('results.for')}</p>
            <h1 className="rh-name">{patient.name}</h1>
            <p className="rh-meta num">
              {t('results.age_sex', { age, sex: t(`results.sex.${patient.sex}`) })}
              <span aria-hidden="true"> · </span>
              {fmtDate(report.report_date)}
              <span aria-hidden="true"> · </span>
              {report.lab_name}
            </p>
            {report.sample && <SampleBadge />}
          </div>
        </div>
        <div className="rh-tools no-print">
          <LanguageSelect id="lang-results" />
          <div className="speech-controls">
            {speech.state === 'playing' ? (
              <button type="button" className="icon-btn outlined" onClick={speech.pause} aria-label={t('results.pause')}><Pause size={20} strokeWidth={1.5} /></button>
            ) : speech.state === 'paused' ? (
              <button type="button" className="icon-btn outlined" onClick={speech.resume} aria-label={t('results.resume')}><Play size={20} strokeWidth={1.5} /></button>
            ) : (
              <button type="button" className="icon-btn outlined" onClick={speech.play} aria-label={t('results.listen')} disabled={speech.state === 'unsupported'}><Volume2 size={20} strokeWidth={1.5} /></button>
            )}
            {(speech.state === 'playing' || speech.state === 'paused') && (
              <button type="button" className="icon-btn outlined" onClick={speech.stop} aria-label={t('results.stop')}><Square size={18} strokeWidth={1.5} /></button>
            )}
          </div>
          <Menu
            triggerClass="outlined"
            triggerLabel={t('results.more')}
            trigger={<EllipsisVertical size={20} strokeWidth={1.5} />}
            items={[
              { key: 'pdf', label: t('results.download'), icon: <Download size={18} strokeWidth={1.5} aria-hidden="true" />, onSelect: () => window.print() },
              { key: 'del', label: t('results.delete'), danger: true, icon: <Trash size={18} strokeWidth={1.5} aria-hidden="true" />, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        </div>
      </header>

      {(speech.state === 'playing' || speech.state === 'paused' || speech.state === 'no-voice') && (
        <ol className="transcript card no-print" aria-label={t('results.listen')}>
          {lines.map((l, i) => <li key={i} className={cx(i === speech.index && 'speaking')} aria-current={i === speech.index ? 'true' : undefined}>{l}</li>)}
        </ol>
      )}
      {speech.state === 'no-voice' && <p className="notice no-print" role="status">{t('results.no_voice')}</p>}

      {!state.consent.save && (
        <div className="notice notice-warn saving-off no-print" role="status">
          <CircleAlert size={20} strokeWidth={1.5} aria-hidden="true" />
          <p>{t('results.saving_off')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { dispatch({ type: 'consent', consent: { save: true, asked: true } }); toast(t('results.saving_on_toast')) }}>
            {t('results.turn_on_saving')}
          </button>
        </div>
      )}

      <CriticalBanner values={critical} />

      <section className="tiles" aria-label={t('results.panels')}>
        <Tile label={t('results.tile_total')} value={counts.total} level="neutral" />
        <Tile label={t('results.tile_within')} value={counts.within} level="normal" />
        <Tile label={t('results.tile_attention')} value={counts.attention} level="abnormal" />
        <Tile label={t('results.tile_prompt')} value={counts.prompt} level="critical" />
      </section>

      <Disclaimer />

      <h2 className="section-title">{t('results.panels')}</h2>
      <div className="panel-grid">
        {panels.map((g) => <PanelCard key={g.id} panel={g.id as PanelId} values={g.values} onOpen={open} />)}
      </div>

      {excluded.length > 0 && (
        <section className="card excluded-card">
          <h2 className="h3">{t('results.excluded_title')}</h2>
          <p className="muted">{t('results.excluded_body')}</p>
          <ul className="excluded-list num">
            {excluded.map((v) => <li key={v.id}><span className="chip chip-grey">{t('confirm.unrec_chip')}</span> {v.raw_name}: {v.value_num ?? v.value_text} {v.unit}</li>)}
          </ul>
        </section>
      )}

      {/* Print-only summary: everything expanded, plus the questions. */}
      <section className="print-only print-summary" aria-hidden="true">
        <h2>{t('results.panels')}</h2>
        <table className="data-table">
          <thead><tr><th>{t('confirm.col_name')}</th><th>{t('confirm.col_value')}</th><th>{t('confirm.col_range')}</th><th>{t('trends.col_status')}</th></tr></thead>
          <tbody>
            {panels.flatMap((g) => g.values).map((v) => (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td className="num">{v.value_num != null ? fmtValue(v.value_num, v.decimals) : v.value_text} {v.unit}</td>
                <td className="num">{v.value_num != null ? rangeLabel(v, t, false) : v.expected}</td>
                <td>{word(v.status, v.value_num == null, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {flagged.length > 0 && (
          <>
            <h2>{t('results.questions_title')}</h2>
            {flagged.map((v) => (
              <div key={v.id} className="print-q">
                <h3>{v.name}</h3>
                <ul>{explain(lang, v.test_id!, v.status).ask_your_doctor.map((q) => <li key={q}>{q}</li>)}</ul>
              </div>
            ))}
          </>
        )}
      </section>

      <DetailDrawer value={detail} onClose={() => setDetail(null)} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('results.delete_title')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)} data-autofocus>{t('results.cancel')}</button>
            <button type="button" className="btn btn-danger" onClick={doDelete}>{t('results.delete_confirm')}</button>
          </>
        }
      >
        <p>{t('results.delete_body', { date: fmtDate(report.report_date) })}</p>
      </Modal>
    </div>
  )
}

function Tile({ label, value, level }: { label: string; value: number; level: 'neutral' | 'normal' | 'abnormal' | 'critical' }) {
  const { t } = useI18n()
  const status = level === 'normal' ? 'normal' : level === 'abnormal' ? 'high' : level === 'critical' ? 'critical_high' : null
  return (
    <div className={cx('tile', `tile-${level}`, value === 0 && level !== 'neutral' && 'is-zero')}>
      <span className="tile-top">
        {status ? <StatusIcon status={status} size={16} /> : <span className="tile-dot" aria-hidden="true" />}
        <span className="tile-label">{label}</span>
      </span>
      <span className="tile-value num">{value}</span>
      {status && <span className="sr-only">{t(`status.${status === 'critical_high' ? 'critical_short' : status}` as 'status.normal')}</span>}
      {level !== 'neutral' && <span className={cx('tile-bar', `lvl-${levelOf(status ?? 'unknown')}`)} aria-hidden="true" />}
    </div>
  )
}
