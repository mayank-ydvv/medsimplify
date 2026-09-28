import raw from '@shared/catalog.json'
import type { PanelId, Sex } from './types'

export interface CatalogRange { sex: 'F' | 'M' | '*'; age_min: number; age_max: number; low: number | null; high: number | null }
export interface CatalogTest {
  id: string
  loinc: string
  name: string
  panel: PanelId
  unit: string
  kind: 'numeric' | 'qualitative'
  decimals: number
  aliases: string[]
  ranges: CatalogRange[]
  critLow: number | null
  critHigh: number | null
  conversions: Record<string, number>
  expected: string | null
  deltaPct: number
  /** [min, max] a measurement can physically take, canonical unit. */
  plausible: [number, number] | null
}

interface RawTest {
  id: string; loinc: string; name: string; panel: string; unit?: string; kind?: string; decimals?: number
  aliases?: string[]; ranges?: CatalogRange[]; critical?: { low: number | null; high: number | null }
  conversions?: { from: string; multiplier: number }[]; expected?: string; delta_pct?: number; plausible?: [number, number]
}

export const unitKey = (u: string) => u.toLowerCase().replace(/[µμ]/g, 'u').replace(/\s/g, '')

/** Mirrors api/app/catalog.py normalise_key. */
export function normaliseKey(name: string): string {
  let s = name.toLowerCase().replace(/µ/g, 'u')
  s = s.replace(/[^a-z0-9+]+/g, ' ').trim()
  s = s.replace(/\b([a-z])((?: [a-z]\b)+)/g, (m) => m.replace(/ /g, ''))
  return s
}

export const PANELS: { id: PanelId; name: string; icon: string }[] = (raw as { panels: { id: PanelId; name: string; icon: string }[] }).panels

export const TESTS: CatalogTest[] = ((raw as { tests: RawTest[] }).tests).map((t) => ({
  id: t.id,
  loinc: t.loinc,
  name: t.name,
  panel: t.panel as PanelId,
  unit: t.unit ?? '',
  kind: (t.kind ?? 'numeric') as 'numeric' | 'qualitative',
  decimals: t.decimals ?? 1,
  aliases: t.aliases ?? [],
  ranges: t.ranges ?? [],
  critLow: t.critical?.low ?? null,
  critHigh: t.critical?.high ?? null,
  conversions: Object.fromEntries((t.conversions ?? []).map((c) => [unitKey(c.from), c.multiplier])),
  expected: t.expected ?? null,
  deltaPct: t.delta_pct ?? 20,
  plausible: t.plausible ?? null,
}))

export const TEST_BY_ID: Record<string, CatalogTest> = Object.fromEntries(TESTS.map((t) => [t.id, t]))

export const EXACT: Record<string, string> = {}
export const ALIAS: Record<string, string> = {}
for (const t of TESTS) {
  EXACT[normaliseKey(t.name)] = t.id
  EXACT[normaliseKey(t.id)] = t.id
  for (const a of t.aliases) ALIAS[normaliseKey(a)] = t.id
}

export function fallbackRange(t: CatalogTest, sex: Sex, age: number): CatalogRange | null {
  return t.ranges.find((r) => (r.sex === sex || r.sex === '*') && r.age_min <= age && age <= r.age_max) ?? null
}

/** Convert a canonical-unit threshold into the unit printed on the row. */
export function toRowUnit(t: CatalogTest, rowUnit: string | null, canonical: number | null): number | null {
  if (canonical == null) return null
  if (!rowUnit || unitKey(rowUnit) === unitKey(t.unit)) return canonical
  const mult = t.conversions[unitKey(rowUnit)]
  if (mult == null) return null // unknown unit: never guess a critical threshold
  return canonical / mult
}
