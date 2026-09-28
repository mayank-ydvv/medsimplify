import { ALIAS, EXACT, TEST_BY_ID, normaliseKey } from './catalog'

/** Client mirror of api/app/pipeline/normalise.py (used for manual rows and
 *  the offline/mock path). exact -> alias -> fuzzy (cutoff 85) -> unmatched. */
export interface Match {
  testId: string | null
  method: 'exact' | 'alias' | 'fuzzy' | 'unmatched'
  confidence: number
}

const FUZZY_CUTOFF = 85
const KEYS: [string, string][] = [...Object.entries(EXACT), ...Object.entries(ALIAS)]

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2))
    }
    prev = cur
  }
  return prev[n]
}

/** Same scale as rapidfuzz fuzz.ratio (InDel distance, 0-100). */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 100
  return (1 - levenshtein(a, b) / (a.length + b.length)) * 100
}

export function matchName(raw: string): Match {
  const key = normaliseKey(raw)
  if (!key) return { testId: null, method: 'unmatched', confidence: 0 }
  if (EXACT[key]) return { testId: EXACT[key], method: 'exact', confidence: 1 }
  if (ALIAS[key]) return { testId: ALIAS[key], method: 'alias', confidence: 0.99 }
  let best: [string, number] | null = null
  for (const [k, id] of KEYS) {
    const s = ratio(key, k)
    if (s >= FUZZY_CUTOFF && (!best || s > best[1])) best = [id, s]
  }
  if (best) return { testId: best[0], method: 'fuzzy', confidence: Math.round(best[1] * 10) / 1000 }
  return { testId: null, method: 'unmatched', confidence: 0 }
}

export function isAutoMatched(raw: string, m: Match): boolean {
  if (!m.testId) return false
  if (m.method === 'fuzzy') return true
  if (m.method === 'alias') {
    const t = TEST_BY_ID[m.testId]
    const literal = raw.trim().toLowerCase()
    return ![t.name.toLowerCase(), t.id.toLowerCase(), ...t.aliases.map((a) => a.toLowerCase())].includes(literal)
  }
  return false
}
