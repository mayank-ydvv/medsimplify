import { describe, expect, it } from 'vitest'
import { valuePatch } from './api'
import { sampleLatest, samplePatient } from './sample'
import { emptyState, reducer, type State } from './store'
import type { LabValue } from './types'

function sampleDraftState(): State {
  const { report, values } = sampleLatest()
  let s = reducer(emptyState, { type: 'addPatient', patient: samplePatient(), activate: true })
  s = reducer(s, { type: 'draft', draft: { report, values, original: values, originalReport: report, parseFailed: false, manual: false } })
  return s
}

describe('sample lifecycle (item 12)', () => {
  it('backing out of the sample leaves nothing behind', () => {
    const s = reducer(sampleDraftState(), { type: 'discardDraft' })
    expect(s.patients).toEqual([])
    expect(s.reports).toEqual([])
    expect(s.activePatientId).toBeNull()
  })

  it('confirming the sample saves its two older reports too', () => {
    const s = reducer(sampleDraftState(), { type: 'commitDraft' })
    expect(s.reports.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3'])
    expect(s.values.filter((v) => v.report_id === 'r1')).toHaveLength(4)
  })

  it('discarding a real person’s draft keeps the person', () => {
    let s = reducer(emptyState, { type: 'addPatient', patient: { id: 'p1', name: 'A', sex: 'F', birth_year: 1960, created_at: '' }, activate: true })
    const { report, values } = sampleLatest()
    const r = { ...report, patient_id: 'p1', sample: false }
    s = reducer(s, { type: 'draft', draft: { report: r, values, original: values, originalReport: r, parseFailed: false, manual: false } })
    s = reducer(s, { type: 'discardDraft' })
    expect(s.patients.map((p) => p.id)).toEqual(['p1'])
  })
})

describe('delete everything withdraws consent (item 11)', () => {
  it('asks again next time', () => {
    let s = reducer(emptyState, { type: 'consent', consent: { analyse: true, save: true, asked: true } })
    s = reducer(s, { type: 'deleteAll' })
    expect(s.consent).toEqual({ analyse: false, save: false, asked: false })
  })
})

describe('server sync sends only real edits (item 10)', () => {
  const base = sampleLatest().values.find((v) => v.raw_name === 'HbA1c') as LabValue

  it('unchanged row sends nothing', () => {
    expect(valuePatch(base, { ...base })).toBeNull()
  })

  it('editing the value never sends the catalog range', () => {
    const body = valuePatch(base, { ...base, value_num: 7.9 })
    expect(body).toEqual({ value_num: 7.9 })
  })

  it('editing the range sends it as a printed range', () => {
    const body = valuePatch(base, { ...base, ref_source: 'report', ref_low: 4, ref_high: 6 })
    expect(body).toEqual({ ref_low: 4, ref_high: 6 })
  })

  it('removing a printed range asks the server to clear it', () => {
    const k = sampleLatest().values.find((v) => v.raw_name === 'Potassium') as LabValue
    const body = valuePatch(k, { ...k, ref_source: 'none', ref_low: null, ref_high: null })
    expect(body).toEqual({ clear_ref: true })
  })
})

describe('deleting one person cascades (item 14)', () => {
  it('removes only that person, their reports and values', () => {
    let s = reducer(sampleDraftState(), { type: 'commitDraft' })
    s = reducer(s, { type: 'addPatient', patient: { id: 'p2', name: 'B', sex: 'M', birth_year: 1970, created_at: '' } })
    s = reducer(s, { type: 'deletePatient', id: 'p-sample' })
    expect(s.patients.map((p) => p.id)).toEqual(['p2'])
    expect(s.reports).toEqual([])
    expect(s.values).toEqual([])
    expect(s.activePatientId).toBe('p2')
  })
})
