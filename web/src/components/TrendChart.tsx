import { useId, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { levelOf } from '../lib/classify'
import { useI18n } from '../lib/i18n'
import type { TrendPoint } from '../lib/trends'
import { fmtPct } from '../lib/trends'
import { fmtDate, fmtValue, pct } from '../lib/util'
import { rangeLabel } from './RangeBar'
import { StatusIcon, StatusPill, useStatusWord } from './Status'

/**
 * Line chart with the reference range drawn as a soft green band across the
 * full width. The line is --green-700 inside the band and turns
 * --status-abnormal for the parts that leave it: the stroke uses a vertical
 * gradient whose stops sit exactly at the band edges (objectBoundingBox of the
 * line spans max..min of the data, so offsets are computed from the data).
 */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw))
  const f = raw / 10 ** exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * 10 ** exp
}

export function TrendChart({ name, points, decimals, height = 320 }: { name: string; points: TrendPoint[]; decimals?: number; height?: number }) {
  const { t } = useI18n()
  const word = useStatusWord()
  const gid = useId().replace(/:/g, '')
  const [asTable, setAsTable] = useState(false)
  const last = points[points.length - 1]
  const lo = last?.low ?? null
  const hi = last?.high ?? null
  const unit = last?.unit ?? ''

  const vals = points.map((p) => p.value)
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)
  const bounds = [...vals, ...(lo != null ? [lo] : []), ...(hi != null ? [hi] : [])]
  const span = Math.max(...bounds) - Math.min(...bounds) || Math.abs(dataMax) || 1
  const step = niceStep((span * 1.5) / 4)
  let yMin = Math.floor((Math.min(...bounds) - span * 0.2) / step) * step
  const yMax = Math.ceil((Math.max(...bounds) + span * 0.2) / step) * step
  if (yMin < 0 && Math.min(...bounds) >= 0) yMin = 0
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + step / 2; v += step) yTicks.push(Number(v.toFixed(6)))

  // numeric time axis padded on both sides, so the band spans the full width
  const times = points.map((p) => Date.parse(p.date))
  const tSpan = Math.max(...times) - Math.min(...times) || 86400000 * 30
  const xDomain: [number, number] = [Math.min(...times) - tSpan * 0.08, Math.max(...times) + tSpan * 0.08]

  // gradient offsets within the line's own bbox (top = dataMax, bottom = dataMin)
  const flat = dataMax === dataMin
  const off = (v: number) => Math.max(0, Math.min(1, (dataMax - v) / (dataMax - dataMin)))
  const offHi = hi != null && !flat ? off(hi) : 0
  const offLo = lo != null && !flat ? off(lo) : 1
  const flatColor = last && levelOf(last.status) === 'normal' ? 'var(--green-700)' : 'var(--status-abnormal)'

  const first = points[0]
  const change = first && last ? pct(first.value, last.value) : null
  const outside = points.filter((p) => p.status !== 'normal').length
  const summary = first && last
    ? t('trends.summary', {
        name, unit,
        first: fmtValue(first.value, decimals), firstDate: fmtDate(first.date),
        last: fmtValue(last.value, decimals), lastDate: fmtDate(last.date),
        pct: fmtPct(change),
        range: rangeLabel({ ref_low: lo, ref_high: hi, decimals, unit }, t),
        outside: outside ? t('trends.summary_out', { n: outside, m: points.length }) : t('trends.summary_in'),
      })
    : ''

  const data = points.map((p, i) => ({ ...p, x: times[i] }))

  return (
    <figure className="trend-figure">
      <figcaption className="trend-caption">
        <p className="trend-summary">{summary}</p>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('trends.view_chart') : t('trends.view_table')}
        </button>
      </figcaption>

      {asTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">{name}</caption>
            <thead>
              <tr>
                <th scope="col">{t('trends.col_date')}</th>
                <th scope="col" className="r">{t('trends.col_value')}</th>
                <th scope="col">{t('trends.col_status')}</th>
                <th scope="col">{t('trends.col_lab')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{fmtDate(p.date)}</th>
                  <td className="r num">{fmtValue(p.value, decimals)} {unit}</td>
                  <td><StatusPill status={p.status} size="sm" short /></td>
                  <td>{p.lab}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="trend-chart" aria-hidden="true" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 28, right: 28, bottom: 8, left: 4 }}>
              <defs>
                <linearGradient id={`stroke-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="var(--status-abnormal)" />
                  <stop offset={offHi} stopColor="var(--status-abnormal)" />
                  <stop offset={offHi} stopColor="var(--green-700)" />
                  <stop offset={offLo} stopColor="var(--green-700)" />
                  <stop offset={offLo} stopColor="var(--status-abnormal)" />
                  <stop offset={1} stopColor="var(--status-abnormal)" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              {(lo != null || hi != null) && (
                <ReferenceArea
                  y1={lo ?? yMin}
                  y2={hi ?? yMax}
                  ifOverflow="hidden"
                  fill="var(--green-050)"
                  fillOpacity={1}
                  stroke="var(--green-200)"
                  strokeWidth={1}
                  label={{ value: t('trends.band'), position: 'insideTopLeft', fill: 'var(--ink-normal)', fontSize: 12, fontWeight: 500 }}
                />
              )}
              <XAxis
                dataKey="x"
                type="number"
                scale="time"
                domain={xDomain}
                ticks={times}
                tickFormatter={(ms: number) => fmtDate(new Date(ms).toISOString().slice(0, 10), undefined, { month: 'short', year: 'numeric' })}
                tick={{ fill: 'var(--text-muted)', fontSize: 13 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-strong)' }}
              />
              <YAxis
                domain={[yMin, yMax]}
                ticks={yTicks}
                tickFormatter={(v: number) => fmtValue(Number(v.toPrecision(4)))}
                tick={{ fill: 'var(--text-muted)', fontSize: 13 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as TrendPoint
                  return (
                    <div className="chart-tip">
                      <div className="tip-date">{fmtDate(p.date)}</div>
                      <div className="tip-value num">{fmtValue(p.value, decimals)} <span>{unit}</span></div>
                      <div className="tip-status"><StatusIcon status={p.status} size={12} /> {word(p.status, false, true)}</div>
                      <div className="tip-lab">{p.lab}</div>
                    </div>
                  )
                }}
              />
              <Line
                type="linear"
                dataKey="value"
                stroke={flat ? flatColor : `url(#stroke-${gid})`}
                strokeWidth={2}
                isAnimationActive
                animationDuration={700}
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) => {
                  const { cx, cy, payload, index } = props
                  if (cx == null || cy == null || !payload) return <g key={index} />
                  const lvl = levelOf(payload.status)
                  return (
                    <g key={index}>
                      <circle cx={cx} cy={cy} r={6} className={`chart-dot lvl-${lvl}`} stroke="var(--surface)" strokeWidth={2} />
                      <text x={cx} y={cy - 14} textAnchor="middle" className="chart-dot-label">{fmtValue(payload.value, decimals)}</text>
                    </g>
                  )
                }}
                activeDot={{ r: 8, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--green-900)' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  )
}
