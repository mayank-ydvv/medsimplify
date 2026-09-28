import { levelOf } from '../lib/classify'
import type { TrendPoint } from '../lib/trends'

/** Tiny trend: normal band + line + dots coloured by status. Decorative;
 *  callers provide the text alternative. */
export function Sparkline({ points, width = 160, height = 44, className }: { points: TrendPoint[]; width?: number; height?: number; className?: string }) {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const vals = points.map((p) => p.value)
  const lo = last.low
  const hi = last.high
  const all = [...vals, ...(lo != null ? [lo] : []), ...(hi != null ? [hi] : [])]
  let min = Math.min(...all)
  let max = Math.max(...all)
  const pad = (max - min || Math.abs(max) || 1) * 0.15
  min -= pad
  max += pad
  if (min < 0 && Math.min(...vals) >= 0) min = 0
  const px = 6
  const py = 6
  const x = (i: number) => px + (i / (points.length - 1)) * (width - px * 2)
  const y = (v: number) => py + (1 - (v - min) / (max - min)) * (height - py * 2)
  const bandTop = hi != null ? y(hi) : py
  const bandBot = lo != null ? y(lo) : height - py
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  return (
    <svg className={className} width="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      {(lo != null || hi != null) && <rect x={0} y={Math.min(bandTop, bandBot)} width={width} height={Math.abs(bandBot - bandTop)} fill="var(--green-050)" />}
      {hi != null && <line x1={0} x2={width} y1={bandTop} y2={bandTop} stroke="var(--green-200)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      {lo != null && <line x1={0} x2={width} y1={bandBot} y2={bandBot} stroke="var(--green-200)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 3.2} className={`spark-dot lvl-${levelOf(p.status)}`} />
      ))}
    </svg>
  )
}
