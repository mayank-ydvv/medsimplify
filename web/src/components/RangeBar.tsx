import { useEffect, useState } from 'react'
import { QUAL_STEPS, levelOf, qualitativeRank } from '../lib/classify'
import { useI18n } from '../lib/i18n'
import type { LabValue } from '../lib/types'
import { cx, fmtValue } from '../lib/util'
import { StatusIcon } from './Status'

/**
 * The signature component: a track with the reference range drawn as a green
 * band and a marker pinned at the patient's value. Values outside the range
 * sit visibly outside the band; the zone past a critical threshold is hatched.
 *
 * Wide ranges (high/low >= 6, e.g. ferritin 30–400, TSH 0.4–4.0) use a log
 * scale so a low value does not get squashed against the edge.
 */
export interface Scale {
  toPct: (x: number) => number
  min: number
  max: number
  log: boolean
}

export function computeScale(value: number, low: number | null, high: number | null): Scale {
  const nonNeg = value >= 0 && (low ?? 0) >= 0
  let min: number
  let max: number
  let log = false
  if (low != null && high != null && high > low) {
    const span = high - low
    log = low > 0 && value > 0 && high / low >= 6
    if (log) {
      const L = Math.log10
      const lspan = L(high) - L(low)
      const lmin = Math.min(L(low) - 0.35 * lspan, L(value) - 0.12 * lspan)
      const lmax = Math.max(L(high) + 0.35 * lspan, L(value) + 0.12 * lspan)
      return { toPct: (x) => ((L(Math.max(x, 1e-9)) - lmin) / (lmax - lmin)) * 100, min: 10 ** lmin, max: 10 ** lmax, log: true }
    }
    min = Math.min(low - span * 0.35, value - span * 0.12)
    max = Math.max(high + span * 0.35, value + span * 0.12)
  } else if (high != null) {
    min = 0
    max = Math.max(high * 1.45, value * 1.12)
    if (value < 0) min = value * 1.2
  } else if (low != null) {
    min = Math.min(low * 0.4, value * 0.8)
    max = Math.max(low * 2, value * 1.25)
  } else {
    min = Math.min(0, value)
    max = Math.max(value * 2, 1)
  }
  if (nonNeg && min < 0) min = 0
  if (max <= min) max = min + 1
  return { toPct: (x) => ((x - min) / (max - min)) * 100, min, max, log }
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function rangeText(v: LabValue, t: ReturnType<typeof useI18n>['t']): string {
  const d = v.decimals
  const unit = v.unit ?? ''
  const value = fmtValue(v.value_num, d)
  const low = fmtValue(v.ref_low, d)
  const high = fmtValue(v.ref_high, d)
  if (v.value_num == null) return t('range.qual', { value: v.value_text ?? '—', expected: v.expected ?? '—' })
  const lv = v.ref_low
  const hv = v.ref_high
  const x = v.value_num
  if (lv != null && hv != null) {
    const key = x < lv ? 'range.below' : x > hv ? 'range.above' : 'range.within'
    return t(key, { value, unit, low, high })
  }
  if (hv != null) return t(x > hv ? 'range.above_max' : 'range.within_max', { value, unit, high })
  if (lv != null) return t(x < lv ? 'range.below_min' : 'range.within_min', { value, unit, low })
  return t('range.none', { value, unit })
}

export function rangeLabel(v: Pick<LabValue, 'ref_low' | 'ref_high' | 'decimals' | 'unit'>, t: ReturnType<typeof useI18n>['t'], withUnit = true): string {
  const d = v.decimals
  const u = withUnit && v.unit ? ` ${v.unit}` : ''
  if (v.ref_low != null && v.ref_high != null) return `${fmtValue(v.ref_low, d)}–${fmtValue(v.ref_high, d)}${u}`
  if (v.ref_high != null) return `${t('range.lt', { high: fmtValue(v.ref_high, d) })}${u}`
  if (v.ref_low != null) return `${t('range.gt', { low: fmtValue(v.ref_low, d) })}${u}`
  return '—'
}

export function RangeBar({ v, size = 'sm', animate = true }: { v: LabValue; size?: 'sm' | 'lg'; animate?: boolean }) {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(!animate)
  useEffect(() => {
    if (!animate) return
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [animate])

  if (v.value_num == null && v.value_text) return <QualBar v={v} size={size} />
  if (v.value_num == null) return null

  const x = v.value_num
  const s = computeScale(x, v.ref_low, v.ref_high)
  const lo = v.ref_low
  const hi = v.ref_high
  const bandStart = lo != null ? clamp(s.toPct(lo)) : hi != null ? 0 : null
  const bandEnd = hi != null ? clamp(s.toPct(hi)) : lo != null ? 100 : null
  const openRight = lo != null && hi == null
  const openLeft = hi != null && lo == null
  const pos = clamp(s.toPct(x))
  const start = bandStart != null && bandEnd != null ? (bandStart + bandEnd) / 2 : 50
  const atLimit = (lo != null && x === lo) || (hi != null && x === hi)
  const level = levelOf(v.status)

  const critHiPct = v.crit_high != null && v.crit_high < s.max ? clamp(s.toPct(v.crit_high)) : null
  const critLoPct = v.crit_low != null && v.crit_low > s.min ? clamp(s.toPct(v.crit_low)) : null

  const d = v.decimals
  const loLabel = lo != null ? (openRight ? t('range.gt', { low: fmtValue(lo, d) }) : fmtValue(lo, d)) : null
  const hiLabel = hi != null ? (openLeft ? t('range.lt', { high: fmtValue(hi, d) }) : fmtValue(hi, d)) : null
  const merged = bandStart != null && bandEnd != null && loLabel && hiLabel && bandEnd - bandStart < 22
  // keep edge labels inside the track
  const align = (p: number, pref: 'start' | 'center' | 'end') => (p < 7 ? 'start' : p > 93 ? 'end' : pref)

  return (
    <div className={cx('rangebar', `rb-${size}`, `lvl-${level}`)} role="img" aria-label={rangeText(v, t)}>
      {size === 'lg' && (
        <div className="rb-bubble-row" aria-hidden="true">
          <span className="rb-bubble num" style={{ left: `${mounted ? pos : start}%` }}>
            {fmtValue(x, d)}
          </span>
        </div>
      )}
      <div className="rb-track" aria-hidden="true">
        {bandStart != null && bandEnd != null && (
          <span
            className={cx('rb-band', openRight && 'open-right', openLeft && 'open-left')}
            style={{ left: `${bandStart}%`, width: `${Math.max(bandEnd - bandStart, 0.8)}%` }}
          />
        )}
        {critLoPct != null && <span className="rb-crit" style={{ left: 0, width: `${critLoPct}%` }} title={t('range.critical_zone')} />}
        {critHiPct != null && <span className="rb-crit" style={{ left: `${critHiPct}%`, right: 0 }} title={t('range.critical_zone')} />}
        {atLimit && <span className="rb-limit" style={{ left: `${pos}%` }} />}
        <span className={cx('rb-marker', `lvl-${level}`)} style={{ left: `${mounted ? pos : start}%` }}>
          <StatusIcon status={v.status} size={size === 'lg' ? 16 : 12} />
        </span>
      </div>
      <div className="rb-labels num" aria-hidden="true">
        {merged ? (
          <span style={{ left: `${(bandStart! + bandEnd!) / 2}%` }} className={align((bandStart! + bandEnd!) / 2, 'center')}>{`${loLabel}–${hiLabel}`}</span>
        ) : (
          <>
            {loLabel && bandStart != null && <span style={{ left: `${bandStart}%` }} className={align(bandStart, openRight ? 'start' : 'center')}>{loLabel}</span>}
            {hiLabel && bandEnd != null && <span style={{ left: `${bandEnd}%` }} className={align(bandEnd, openLeft ? 'end' : 'center')}>{hiLabel}</span>}
          </>
        )}
        {atLimit && size === 'lg' && <span className="rb-limit-label" style={{ left: `${pos}%` }}>{t('range.at_limit')}</span>}
      </div>
    </div>
  )
}

function QualBar({ v, size }: { v: LabValue; size: 'sm' | 'lg' }) {
  const { t } = useI18n()
  const got = qualitativeRank(v.value_text ?? '') ?? -1
  const want = qualitativeRank(v.expected ?? 'Nil') ?? 0
  const steps = QUAL_STEPS.slice(0, Math.max(5, got + 1))
  return (
    <div className={cx('qualbar', `rb-${size}`)} role="img" aria-label={t('range.qual', { value: v.value_text ?? '—', expected: v.expected ?? '—' })}>
      <ol className="qb-steps" aria-hidden="true">
        {steps.map((label, i) => (
          <li key={label} className={cx(i <= want && 'expected', i === got && `current lvl-${levelOf(v.status)}`)}>
            <span className="qb-cell">{i === got && <StatusIcon status={v.status} size={size === 'lg' ? 16 : 12} />}</span>
            <span className="qb-label">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
