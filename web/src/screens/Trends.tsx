import { ArrowDownRight, ArrowRight, ArrowUpRight, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SampleBadge } from '../components/Chrome'
import { Combobox } from '../components/Combobox'
import { Sparkline } from '../components/Sparkline'
import { StatusIcon } from '../components/Status'
import { TrendChart } from '../components/TrendChart'
import { TEST_BY_ID } from '../lib/catalog'
import { isDemo } from '../lib/demo'
import { useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import { fmtPct, tracked } from '../lib/trends'
import { cx, fmtDate, fmtValue } from '../lib/util'
import { EmptyState } from './States'

export default function Trends() {
  const { t } = useI18n()
  const { state, activePatient } = useStore()
  const [params, setParams] = useSearchParams()

  const all = useMemo(
    () => (activePatient && !isDemo('empty') ? tracked(state.values, state.reports, activePatient.id) : []),
    [state.values, state.reports, activePatient],
  )
  const requested = params.get('test')
  const current = all.find((x) => x.testId === requested) ?? all[0]
  const isSample = !!activePatient?.sample

  const head = (
    <header className="page-head">
      <div>
        <h1 className="h2">{t('trends.h2')}</h1>
        <p className="page-sub">{t('trends.sub')}</p>
      </div>
      {isSample && all.length > 0 && <SampleBadge />}
    </header>
  )

  if (!current) {
    return (
      <div className="page">
        {head}
        <EmptyState
          art="trends"
          title={t('trends.empty_title')}
          body={t('trends.empty')}
          action={<Link to="/" className="btn btn-primary"><Upload size={18} strokeWidth={1.5} aria-hidden="true" />{t('trends.empty_btn')}</Link>}
        />
      </div>
    )
  }

  const select = (id: string) => setParams({ test: id }, { replace: true })
  const decimals = TEST_BY_ID[current.testId]?.decimals
  const deltas = all.filter((x) => x.delta)
  const others = all.filter((x) => x.testId !== current.testId)

  return (
    <div className="page trends">
      {head}

      <section className="card trend-main" aria-labelledby="trend-name">
        <div className="trend-top">
          <div className="trend-picker">
            <span className="field-label" id="trend-pick-label">{t('trends.select')}</span>
            <Combobox
              id="trend-pick"
              options={all.map((x) => ({ value: x.testId, label: x.name, hint: t('trends.readings', { n: x.points.length }) }))}
              value={current.testId}
              onChange={select}
              label={t('trends.search')}
              placeholder={t('trends.search')}
              emptyText={t('confirm.map_none')}
            />
          </div>
          <div className="trend-headline">
            <h2 id="trend-name" className="h3">{current.name}</h2>
            <p className="num trend-delta-big">
              <StatusIcon status={current.points[current.points.length - 1].status} size={14} />
              {t('trends.from_to', {
                from: `${fmtValue(current.points[0].value, decimals)}`,
                to: `${fmtValue(current.points[current.points.length - 1].value, decimals)} ${current.points[0].unit ?? ''}`,
              })}
              <span className="pct">{fmtPct(current.overallPct)}</span>
            </p>
          </div>
        </div>
        <TrendChart key={current.testId} name={current.name} points={current.points} decimals={decimals} />
      </section>

      <section className="delta-strip" aria-labelledby="delta-title">
        <div className="section-head">
          <h2 id="delta-title" className="h3">{t('trends.delta_title')}</h2>
          <p className="muted">{t('trends.delta_sub')}</p>
        </div>
        {deltas.length === 0 ? (
          <p className="card muted pad">{t('trends.delta_none')}</p>
        ) : (
          <ul className="delta-list">
            {deltas.map((d) => {
              const a = d.points[d.points.length - 2]
              const b = d.points[d.points.length - 1]
              const up = b.value > a.value
              const Arrow = up ? ArrowUpRight : ArrowDownRight
              const dec = TEST_BY_ID[d.testId]?.decimals
              return (
                <li key={d.testId} className={cx('card delta-card', d.movingWithinRange ? 'within' : 'outside')}>
                  <div className="delta-top">
                    <span className="delta-name">{d.name}</span>
                    <span className="delta-pct num"><Arrow size={18} strokeWidth={1.8} aria-hidden="true" />{fmtPct(d.lastPct)}</span>
                  </div>
                  <p className="delta-values num">
                    <span>{fmtValue(a.value, dec)}</span>
                    <ArrowRight size={16} strokeWidth={1.5} aria-label="to" />
                    <strong>{fmtValue(b.value, dec)}</strong> <span className="unit">{b.unit}</span>
                  </p>
                  <p className="delta-dates num">{fmtDate(a.date)} → {fmtDate(b.date)}</p>
                  <p className="delta-label">
                    <StatusIcon status={d.movingWithinRange ? 'borderline_high' : b.status} size={14} />
                    {d.movingWithinRange ? t('trends.delta_label') : t('trends.delta_label_out')}
                  </p>
                  {d.testId !== current.testId && (
                    <button type="button" className="link-btn" onClick={() => select(d.testId)}>{t('trends.load', { name: d.name })}</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section aria-labelledby="others-title">
          <h2 id="others-title" className="h3 section-title">{t('trends.others')}</h2>
          <ul className="multiples">
            {others.map((o) => {
              const last = o.points[o.points.length - 1]
              const dec = TEST_BY_ID[o.testId]?.decimals
              return (
                <li key={o.testId}>
                  <button type="button" className="card multiple" onClick={() => select(o.testId)} aria-label={`${t('trends.load', { name: o.name })}. ${o.points.map((p) => fmtValue(p.value, dec)).join(', ')} ${last.unit ?? ''}`}>
                    <span className="mult-head">
                      <span className="mult-name">{o.name}</span>
                      <span className="mult-pct num">{fmtPct(o.overallPct)}</span>
                    </span>
                    <Sparkline points={o.points} width={220} height={56} />
                    <span className="mult-foot num">
                      <StatusIcon status={last.status} size={12} />
                      {fmtValue(last.value, dec)} {last.unit}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
