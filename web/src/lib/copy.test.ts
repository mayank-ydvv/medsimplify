import { describe, expect, it } from 'vitest'
import { en } from '../locales/en'
import { DICTS, EXPLANATIONS } from './i18n'

/**
 * The scope boundary, enforced in code: the app explains, it never diagnoses
 * or reassures. No locale string or explanation may call a person "safe",
 * "fine" or "healthy", say there is "nothing to worry about", or state a
 * condition as a conclusion ("you have diabetes").
 */
const BANNED_EN = /\b(safe|fine|healthy|harmless|nothing to worry about|no need to worry|you have (?:diabetes|anaemia|anemia|a (?:disease|condition))|you are (?:diabetic|anaemic|anemic)|diagnos(?:ed|is of))\b/i

// Direct equivalents of "safe / healthy / nothing to worry" in each language.
const BANNED_LOCAL: Record<string, RegExp> = {
  hi: /(सुरक्षित|स्वस्थ|चिंता की कोई बात नहीं|घबराने की कोई बात नहीं)/,
  mr: /(सुरक्षित|निरोगी|काळजीचे कारण नाही)/,
  bn: /(নিরাপদ|সুস্থ|চিন্তার কিছু নেই)/,
  ta: /(பாதுகாப்பான|ஆரோக்கியமான|கவலைப்பட ஒன்றுமில்லை)/,
  te: /(సురక్షిత|ఆరోగ్యంగా|చింతించాల్సిన అవసరం లేదు)/,
}

const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []

describe('copy guard', () => {
  for (const [lang, dict] of Object.entries(DICTS)) {
    it(`UI strings (${lang})`, () => {
      for (const s of strings(dict)) {
        expect(s, s).not.toMatch(BANNED_EN)
        if (BANNED_LOCAL[lang]) expect(s, s).not.toMatch(BANNED_LOCAL[lang])
      }
    })
  }
  for (const [lang, file] of Object.entries(EXPLANATIONS)) {
    it(`explanations (${lang})`, () => {
      for (const s of strings(file)) {
        expect(s, s).not.toMatch(BANNED_EN)
        if (BANNED_LOCAL[lang]) expect(s, s).not.toMatch(BANNED_LOCAL[lang])
      }
    })
  }

  it('the persistent disclaimer says it does not diagnose', () => {
    expect(en.disclaimer).toBe('This explains what your report says. It does not diagnose. Discuss results with your doctor.')
  })

  it('translations only use keys that exist in English, and keep placeholders', () => {
    for (const [lang, dict] of Object.entries(DICTS)) {
      for (const [k, v] of Object.entries(dict)) {
        expect(k in en, `${lang}: unknown key ${k}`).toBe(true)
        const want = (en[k as keyof typeof en].match(/\{\w+\}/g) ?? []).sort()
        const got = ((v as string).match(/\{\w+\}/g) ?? []).sort()
        expect(got, `${lang}:${k}`).toEqual(want)
      }
    }
  })

  it('explanations never bake in numbers (the UI renders numbers from parsed state)', () => {
    for (const [lang, file] of Object.entries(EXPLANATIONS)) {
      for (const [id, entry] of Object.entries(file)) {
        if (id.startsWith('_')) continue
        // digits are allowed only inside test names such as B12, T3, HbA1c
        const text = strings(entry).join(' ').replace(/\b(?:B12|T3|T4|HbA1c|A1c|25-OH)\b/gi, '')
        expect(text, `${lang}:${id}`).not.toMatch(/\d/)
      }
    }
  })
})
