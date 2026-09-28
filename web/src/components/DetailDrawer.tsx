import { Check, Copy, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isCritical, levelOf } from '../lib/classify'
import { explain, useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import { series } from '../lib/trends'
import type { LabValue } from '../lib/types'
import { cx, fmtValue } from '../lib/util'
import { Disclaimer } from './Chrome'
import { Drawer } from './Overlay'
import { RangeBar, rangeLabel } from './RangeBar'
import { Sparkline } from './Sparkline'
import { StatusPill } from './Status'

export function DetailDrawer({ value, onClose }: { value: LabValue | null; onClose: () => void }) {
  const { lang } = useI18n()
  return (
    <Drawer open={!!value} onClose={onClose} label={value?.name ?? ''} footer={<Disclaimer compact />}>
      {value && <DetailBody v={value} key={`${value.id}-${lang}`} />}
    </Drawer>
  )
}

function whoLabel(v: LabValue, t: ReturnType<typeof useI18n>['t']): string {
  const b = v.ref_band
  if (!b) return t('drawer.who.any')
  const who = t(b.sex === 'F' ? 'drawer.who.F' : b.sex === 'M' ? 'drawer.who.M' : 'drawer.who.any')
  if (b.age_min <= 18 && b.age_max >= 100) return who
  if (b.age_max >= 100) return t('drawer.who_age_plus', { who, min: b.age_min })
  return t('drawer.who_age', { who, min: b.age_min, max: b.age_max })
}

function DetailBody({ v }: { v: LabValue }) {
  const { t, lang } = useI18n()
  const { state } = useStore()
  const [copied, setCopied] = useState(false)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const ex = v.test_id ? explain(lang, v.test_id, v.status) : null
  const qual = v.value_num == null && !!v.value_text
  const pts = v.test_id ? series(state.values, state.reports, v.patient_id, v.test_id) : []
  const level = levelOf(v.status)
  const atLimit = v.value_num != null && (v.value_num === v.ref_low || v.value_num === v.ref_high)

  const copy = async () => {
    const text = `${v.name}\n${(ex?.ask_your_doctor ?? []).map((q) => `- ${q}`).join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2400)
  }

  const src = v.ref_source === 'report'
    ? { label: t('drawer.src_report'), hint: t('drawer.src_report_hint'), cls: 'src-report' }
    : v.ref_source === 'catalog'
      ? { label: t('drawer.src_catalog', { who: whoLabel(v, t) }), hint: t('drawer.src_catalog_hint'), cls: 'src-catalog' }
      : { label: t('drawer.src_none'), hint: '', cls: 'src-none' }

  const valueStr = qual ? v.value_text ?? '' : fmtValue(v.value_num, v.decimals)

  return (
    <article className={cx('detail', `lvl-${level}`)}>
      <header className="detail-head">
        <h2 className="detail-title">{v.name}</h2>
        {v.loinc && <p className="detail-loinc num">{t('drawer.loinc', { code: v.loinc })}</p>}
      </header>

      <div className="detail-value">
        <span className="value-xl num">{valueStr}</span>
        {v.unit && <span className="detail-unit">{v.unit}</span>}
        <StatusPill status={v.status} qualitative={qual} size="lg" implausible={v.implausible} />
      </div>

      {isCritical(v.status) && (
        <p className="detail-critical" role="alert">{t('drawer.critical')}</p>
      )}

      <div className="detail-bar"><RangeBar v={v} size="lg" /></div>

      <div className={cx('src-tag', src.cls)}>
        <span className="src-label">{src.label}</span>
        {!qual && v.ref_source !== 'none' && <span className="src-range num">{rangeLabel(v, t)}</span>}
        {src.hint && <span className="src-hint">{src.hint}</span>}
      </div>

      {ex && (
        <>
          <section className="detail-sec">
            <h3>{t('drawer.measures')}</h3>
            <p>{ex.what_it_measures}</p>
          </section>
          <section className="detail-sec">
            <h3>{t('drawer.means')}</h3>
            <p>
              <span className="num">{t('drawer.your_value', { value: valueStr, unit: v.unit ?? '' }).replace(/\s+\./, '.')}</span>{' '}
              {qual
                ? t('drawer.expected_is', { expected: v.expected ?? '—' })
                : v.ref_source !== 'none' && <span className="num">{t('drawer.range_is', { range: rangeLabel(v, t) })}</span>}
            </p>
            <p>{v.implausible ? t('drawer.implausible') : ex.what_yours_means}</p>
            {(v.status === 'borderline_low' || (v.status === 'borderline_high' && !qual)) && <p>{t('drawer.slightly')}</p>}
            {atLimit && <p>{t('drawer.at_limit')}</p>}
          </section>
          <section className="detail-sec">
            {v.status === 'normal' ? (
              <>
                <h3>{t('drawer.causes_normal')}</h3>
                <p>{t('drawer.causes_normal_body')}</p>
              </>
            ) : (
              <>
                <h3>{t('drawer.causes')}</h3>
                <ul className="bullets">{ex.common_causes.map((c) => <li key={c}>{c}</li>)}</ul>
              </>
            )}
          </section>
          <section className="detail-sec">
            <div className="sec-head">
              <h3>{t('drawer.ask')}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                {copied ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.5} aria-hidden="true" />}
                {copied ? t('drawer.copied') : t('drawer.copy')}
              </button>
            </div>
            <ul className="checklist">
              {ex.ask_your_doctor.map((q, i) => (
                <li key={q}>
                  <label>
                    <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} />
                    <span className="check-box" aria-hidden="true"><Check size={14} strokeWidth={2} /></span>
                    <span>{q}</span>
                  </label>
                </li>
              ))}
            </ul>
            <span className="sr-only" aria-live="polite">{copied ? t('drawer.copied') : ''}</span>
          </section>
        </>
      )}

      {pts.length >= 2 && (
        <section className="detail-sec detail-trend">
          <div className="sec-head">
            <h3>{t('drawer.trend')}</h3>
            <Link to={`/trends?test=${v.test_id}`} className="link-btn">
              <TrendingUp size={16} strokeWidth={1.5} aria-hidden="true" />
              {t('drawer.see_trend')}
            </Link>
          </div>
          <Sparkline points={pts} width={360} height={64} />
          <p className="spark-caption num">{pts.map((p) => fmtValue(p.value, v.decimals)).join(' → ')} {v.unit}</p>
        </section>
      )}
    </article>
  )
}
