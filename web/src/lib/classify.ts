import type { Level, Status } from './types'

/**
 * Deterministic classification — mirrors api/app/pipeline/classify.py and is
 * checked against the same vectors (shared/classify_cases.json).
 * Critical first; deviation is relative to the bound that was crossed.
 */
export const BORDERLINE = 0.1

function denom(bound: number, low: number | null, high: number | null): number {
  if (bound !== 0) return Math.abs(bound)
  if (low != null && high != null && high !== low) return high - low
  return 1
}

export function deviation(value: number, low: number | null, high: number | null): number {
  if (low != null && value < low) return (low - value) / denom(low, low, high)
  if (high != null && value > high) return (value - high) / denom(high, low, high)
  return 0
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4

export function classify(
  value: number,
  low: number | null,
  high: number | null,
  critLow: number | null = null,
  critHigh: number | null = null,
): { status: Status; deviation: number } {
  const dev = r4(deviation(value, low, high))
  if (critLow != null && value <= critLow) return { status: 'critical_low', deviation: dev }
  if (critHigh != null && value >= critHigh) return { status: 'critical_high', deviation: dev }
  // Nothing to compare with: never call this "normal".
  if (low == null && high == null) return { status: 'unknown', deviation: 0 }
  if (low != null && value < low) return { status: dev < BORDERLINE ? 'borderline_low' : 'low', deviation: dev }
  if (high != null && value > high) return { status: dev < BORDERLINE ? 'borderline_high' : 'high', deviation: dev }
  return { status: 'normal', deviation: 0 }
}

const ORDINAL: Record<string, number> = {
  nil: 0, negative: 0, neg: 0, absent: 0, 'not detected': 0, none: 0,
  trace: 1, traces: 1,
  '1+': 2, '+': 2, positive: 2, present: 2, pos: 2, detected: 2,
  '2+': 3, '++': 3,
  '3+': 4, '+++': 4,
  '4+': 5, '++++': 5,
}

export const QUAL_STEPS = ['Nil', 'Trace', '1+', '2+', '3+', '4+'] as const

export function qualitativeRank(text: string): number | null {
  let key = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')
  key = key.replace(/^(?:positive|present)\s*\(?\s*([1-4]\+)\s*\)?$/, '$1')
  return key in ORDINAL ? ORDINAL[key] : null
}

export function classifyQualitative(value: string, expected: string): { status: Status; deviation: number } {
  const got = qualitativeRank(value)
  const want = qualitativeRank(expected)
  if (got == null || want == null) return { status: 'unknown', deviation: 0 }
  const steps = got - want
  if (steps <= 0) return { status: 'normal', deviation: 0 }
  if (steps === 1) return { status: 'borderline_high', deviation: 1 }
  return { status: 'high', deviation: steps }
}

export function levelOf(s: Status): Level {
  switch (s) {
    case 'normal': return 'normal'
    case 'borderline_low':
    case 'borderline_high': return 'borderline'
    case 'low':
    case 'high': return 'abnormal'
    case 'critical_low':
    case 'critical_high': return 'critical'
    default: return 'unknown'
  }
}

export function directionOf(s: Status): 'low' | 'high' | 'normal' {
  if (s.endsWith('low')) return 'low'
  if (s.endsWith('high')) return 'high'
  return 'normal'
}

/** Lower rank sorts first: critical, abnormal, borderline, unknown, normal. */
export const STATUS_RANK: Record<Status, number> = {
  critical_low: 0, critical_high: 0, low: 1, high: 1, borderline_low: 2, borderline_high: 2,
  unknown: 3, unrecognised: 5, normal: 4,
}

export const isAbnormal = (s: Status) => ['low', 'high', 'borderline_low', 'borderline_high', 'critical_low', 'critical_high'].includes(s)
export const isCritical = (s: Status) => s === 'critical_low' || s === 'critical_high'
