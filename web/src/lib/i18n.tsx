import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import enEx from '@shared/explanations/en.json'
import hiEx from '@shared/explanations/hi.json'
import bnEx from '@shared/explanations/bn.json'
import taEx from '@shared/explanations/ta.json'
import teEx from '@shared/explanations/te.json'
import mrEx from '@shared/explanations/mr.json'
import { en, type MsgKey } from '../locales/en'
import { hi } from '../locales/hi'
import { bn } from '../locales/bn'
import { ta } from '../locales/ta'
import { te } from '../locales/te'
import { mr } from '../locales/mr'
import { directionOf } from './classify'
import { PANELS, TEST_BY_ID } from './catalog'
import type { Explanation, Lang, PanelId, Status } from './types'
import { setDateLocale } from './util'

export const LANGS: { code: Lang; label: string; speech: string; html: string }[] = [
  { code: 'en', label: 'English', speech: 'en-IN', html: 'en' },
  { code: 'hi', label: 'हिन्दी', speech: 'hi-IN', html: 'hi' },
  { code: 'bn', label: 'বাংলা', speech: 'bn-IN', html: 'bn' },
  { code: 'ta', label: 'தமிழ்', speech: 'ta-IN', html: 'ta' },
  { code: 'te', label: 'తెలుగు', speech: 'te-IN', html: 'te' },
  { code: 'mr', label: 'मराठी', speech: 'mr-IN', html: 'mr' },
]

export type Dict = Partial<Record<MsgKey, string>>
const DICTS: Record<Lang, Dict> = { en, hi, bn, ta, te, mr }

interface ExEntry {
  measures: string
  low?: { means: string; causes?: string[]; ask?: string[] }
  high?: { means: string; causes?: string[]; ask?: string[] }
  normal?: { means: string; causes?: string[]; ask?: string[] }
}
type ExFile = Record<string, unknown> & { _generic: ExEntry; _panels?: Record<string, string>; _ui?: Record<string, string> }
const EXPLANATIONS: Record<Lang, ExFile> = {
  en: enEx as unknown as ExFile,
  hi: hiEx as unknown as ExFile,
  bn: bnEx as unknown as ExFile,
  ta: taEx as unknown as ExFile,
  te: teEx as unknown as ExFile,
  mr: mrEx as unknown as ExFile,
}

export function translate(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? en[key] ?? key
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function panelName(lang: Lang, id: PanelId): string {
  return EXPLANATIONS[lang]._panels?.[id] ?? EXPLANATIONS.en._panels?.[id] ?? PANELS.find((p) => p.id === id)?.name ?? id
}

/** Static explanation. Numbers are never in these strings — the UI renders
 *  every number from parsed state. Falls back to the panel-level generic text
 *  in the same language, so the reader never gets a mixed-language page. */
export function explain(lang: Lang, testId: string, status: Status): Explanation {
  const ex = explainByDirection(lang, testId, status)
  if (status === 'unknown') {
    // No range to compare with: never borrow the "within range" wording.
    const noRange = EXPLANATIONS[lang]._ui?.no_range ?? EXPLANATIONS.en._ui?.no_range ?? ''
    return { ...ex, what_yours_means: noRange, common_causes: [] }
  }
  return ex
}

function explainByDirection(lang: Lang, testId: string, status: Status): Explanation {
  const d = directionOf(status)
  const t = TEST_BY_ID[testId]
  const entry = EXPLANATIONS[lang][testId] as ExEntry | undefined
  const block = entry?.[d]
  if (entry && block) {
    return { what_it_measures: entry.measures, what_yours_means: block.means, common_causes: block.causes ?? [], ask_your_doctor: block.ask ?? [], source: 'static' }
  }
  const g = EXPLANATIONS[lang]._generic ?? EXPLANATIONS.en._generic
  const gb = g[d] ?? EXPLANATIONS.en._generic[d]!
  return {
    what_it_measures: g.measures.replace('{panel}', t ? panelName(lang, t.panel) : ''),
    what_yours_means: gb.means,
    common_causes: gb.causes ?? [],
    ask_your_doctor: gb.ask ?? [],
    source: 'static_generic',
  }
}

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: MsgKey, vars?: Record<string, string | number>) => string
}

const I18nCtx = createContext<I18nValue | null>(null)

export function I18nProvider({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: ReactNode }) {
  // before children render, so every date on this pass uses the new language
  setDateLocale(`${LANGS.find((l) => l.code === lang)?.speech ?? 'en-IN'}-u-nu-latn`)
  const t = useCallback((key: MsgKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n(): I18nValue {
  const v = useContext(I18nCtx)
  if (!v) throw new Error('useI18n outside provider')
  return v
}

export { DICTS, EXPLANATIONS }
