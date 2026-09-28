import { qualitativeRank } from './classify'

/** Mirrors api/app/pipeline/parse.py. Accepts hyphen, en-dash and em-dash —
 *  missing those makes ranges parse as null and abnormal values read as normal. */
const DASH = '[-‐‑‒–—−]'
const NUM = '\\d+(?:[.,]\\d+)?'
const BETWEEN = new RegExp(`^\\(?\\s*(${NUM})\\s*(?:${DASH}|to)\\s*(${NUM})\\s*\\)?$`, 'i')
const LT = new RegExp(`^\\(?\\s*(?:<|≤|<=|upto|up to|less than|below|under)\\s*(${NUM})\\s*\\)?$`, 'i')
const GT = new RegExp(`^\\(?\\s*(?:>|≥|>=|more than|above|greater than|over)\\s*(${NUM})\\s*\\)?$`, 'i')

const num = (s: string) => Number(s.replace(',', '.'))

/** "7,200" and "2,60,000" are digit grouping, "1,5" is a decimal comma. */
export const ungroup = (s: string) => s.replace(/(?<=\d),(?=(?:\d{2},)*\d{3}(?!\d))/g, '')

/** Strip abnormal-value flags labs print by the number: "6.3 H", "6.3*", "↑ 6.3". */
export function stripFlag(s: string): string {
  const m = /^\s*(?:[↑↓*]+\s*)?(.*?)(?:\s*(?:(?<![A-Za-z])(?:HH|LL|H|L)|[↑↓*]+))?\s*$/.exec(s)
  return m ? m[1] : s
}

export interface ParsedRange { low: number | null; high: number | null; text: string | null }

export function parseRange(input: string): ParsedRange | null {
  const t = ungroup(input.trim())
  if (!t) return { low: null, high: null, text: null }
  let m = BETWEEN.exec(t)
  if (m) return { low: num(m[1]), high: num(m[2]), text: null }
  m = LT.exec(t)
  if (m) return { low: null, high: num(m[1]), text: null }
  m = GT.exec(t)
  if (m) return { low: num(m[1]), high: null, text: null }
  if (qualitativeRank(t) != null) return { low: null, high: null, text: t }
  return null
}

export function parseValue(input: string): { num: number | null; text: string | null } | null {
  const t = ungroup(stripFlag(input.trim()))
  if (!t) return null
  if (/^[<>]?\s*\d+(?:[.,]\d+)?$/.test(t)) return { num: num(t.replace(/[<>\s]/g, '')), text: null }
  if (qualitativeRank(t) != null) return { num: null, text: t }
  return null
}
