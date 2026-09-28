import { describe, expect, it } from 'vitest'
import cases from '@shared/classify_cases.json'
import { classify, classifyQualitative } from './classify'
import { parseRange, parseValue } from './parse'
import { analyseRow } from './analyse'
import { explain } from './i18n'
import { sampleHistory, sampleLatest } from './sample'
import { tracked } from './trends'
import { matchName, isAutoMatched } from './normalise'

describe('classify — shared vectors (same file pytest runs)', () => {
  for (const c of cases.numeric) {
    it(c.name, () => {
      const r = classify(c.value, c.low, c.high, c.crit_low, c.crit_high)
      expect(r.status).toBe(c.status)
      expect(r.deviation).toBeCloseTo(c.deviation, 3)
    })
  }
  for (const c of cases.qualitative) {
    it(c.name, () => {
      const r = classifyQualitative(c.value, c.expected)
      expect(r.status).toBe(c.status)
      expect(r.deviation).toBe(c.deviation)
    })
  }
})

describe('range parsing accepts every dash', () => {
  it.each(['12.0 - 15.0', '12.0 – 15.0', '12.0 — 15.0', '12.0−15.0', '12.0 to 15.0'])('%s', (s) => {
    expect(parseRange(s)).toEqual({ low: 12, high: 15, text: null })
  })
  it('one-sided and qualitative', () => {
    expect(parseRange('< 200')).toEqual({ low: null, high: 200, text: null })
    expect(parseRange('> 40')).toEqual({ low: 40, high: null, text: null })
    expect(parseRange('Nil')).toEqual({ low: null, high: null, text: 'Nil' })
  })
})

describe('name matching mirrors the API', () => {
  it('S.G.P.T is an auto-matched alias of ALT', () => {
    const m = matchName('S.G.P.T')
    expect(m.testId).toBe('ALT')
    expect(isAutoMatched('S.G.P.T', m)).toBe(true)
  })
  it('fuzzy correction', () => {
    expect(matchName('Heamoglobin')).toMatchObject({ testId: 'HGB', method: 'fuzzy' })
  })
  it('unknown stays unmatched', () => {
    expect(matchName('Homocysteine').testId).toBeNull()
  })
})

describe('sample data is re-classified deterministically', () => {
  const { values } = sampleLatest()
  const by = Object.fromEntries(values.map((v) => [v.raw_name, v]))
  it('statuses', () => {
    expect(by['Potassium'].status).toBe('critical_high')
    expect(by['Creatinine'].status).toBe('normal')
    expect(by['Vitamin B12'].status).toBe('borderline_low')
    expect(by['Ferritin'].status).toBe('low')
    expect(by['HbA1c']).toMatchObject({ status: 'high', ref_source: 'catalog' })
    expect(by['Urine Protein'].status).toBe('borderline_high')
    expect(by['S.G.P.T']).toMatchObject({ test_id: 'ALT', auto_matched: true, status: 'high' })
    expect(by['Homocysteine']).toMatchObject({ status: 'unrecognised', included: false })
    expect(by['Platelet Count'].crit_low).toBeCloseTo(0.2)
  })
  it('trends: creatinine moves most and trips the delta check while in range', () => {
    const hist = sampleHistory()
    const latest = sampleLatest()
    const all = tracked([...hist.values, ...latest.values], [...hist.reports, { ...latest.report, status: 'confirmed' }], 'p-sample')
    expect(all[0].testId).toBe('CREAT')
    expect(all[0].movingWithinRange).toBe(true)
    expect(Math.round(all[0].lastPct!)).toBe(22)
    expect(all.filter((x) => x.delta).map((x) => x.testId)).toEqual(['CREAT'])
  })
})

describe('safety fixes (mirror of api/tests/test_safety.py)', () => {
  const ctx = { sex: 'F' as const, age: 70, report_id: 'r', patient_id: 'p', report_date: '2026-09-12' }

  it.each([
    ['7,200', 7200], ['2,60,000', 260000], ['1,5', 1.5], ['6.3 H', 6.3], ['6.3H', 6.3], ['6.3*', 6.3], ['↑ 6.3', 6.3],
  ])('parseValue(%s) = %s', (text, want) => {
    expect(parseValue(text)).toEqual({ num: want, text: null })
  })

  it('flags never eat qualitative words', () => {
    expect(parseValue('NIL')).toEqual({ num: null, text: 'NIL' })
  })

  it('grouped ranges', () => {
    expect(parseRange('1,50,000 – 4,10,000')).toEqual({ low: 150000, high: 410000, text: null })
  })

  it('no range to compare is unknown, never "within range"', () => {
    const v = analyseRow({ raw_name: 'Haemoglobin', value_num: 10.4, unit: 'mmol/L' }, ctx)
    expect(v.ref_source).toBe('none')
    expect(v.status).toBe('unknown')
    expect(explain('en', 'HGB', 'unknown').what_yours_means).toMatch(/no range/i)
  })

  it('a dropped decimal point is flagged for checking, not alarmed', () => {
    const v = analyseRow({ raw_name: 'Haemoglobin', value_num: 104, unit: 'g/dL', ref_low: 12, ref_high: 15, has_range: true }, ctx)
    expect(v).toMatchObject({ implausible: true, status: 'unknown' })
  })

  it('a real panic value is still critical', () => {
    const v = analyseRow({ raw_name: 'Potassium', value_num: 7.8, unit: 'mmol/L', ref_low: 3.5, ref_high: 5.1, has_range: true }, ctx)
    expect(v).toMatchObject({ implausible: false, status: 'critical_high' })
  })
})

describe('delta check ignores big percentages of tiny numbers (item 17)', () => {
  it('CRP 0.1 -> 0.3 is +200% but below 10% of the limit', async () => {
    const { minDelta } = await import('./trends')
    expect(0.3 - 0.1).toBeLessThan(minDelta({ low: null, high: 6 }))
    expect(1.1 - 0.9).toBeGreaterThanOrEqual(minDelta({ low: 0.6, high: 1.1 }))
  })
})
