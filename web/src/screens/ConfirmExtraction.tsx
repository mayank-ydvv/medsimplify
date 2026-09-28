import { ArrowLeft, CircleAlert, Plus, Trash, WandSparkles } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Combobox } from '../components/Combobox'
import { Disclaimer, SampleBadge } from '../components/Chrome'
import { Modal } from '../components/Overlay'
import { rangeLabel } from '../components/RangeBar'
import { StatusIcon, useStatusWord } from '../components/Status'
import { analyseRow, toRowInput, type Ctx } from '../lib/analyse'
import { api, syncDraft } from '../lib/api'
import { TESTS } from '../lib/catalog'
import { panelName, useI18n } from '../lib/i18n'
import { parseRange, parseValue } from '../lib/parse'
import { useStore } from '../lib/store'
import type { LabValue, Report } from '../lib/types'
import { ageOn, cx, fmtDate, fmtValue, uid } from '../lib/util'

type Field = 'name' | 'value' | 'unit' | 'range'

export default function ConfirmExtraction() {
  const { t, lang } = useI18n()
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const draft = state.draft
  const [editing, setEditing] = useState<{ id: string; field: Field } | null>(null)
  const [mapping, setMapping] = useState<string | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const leaving = useRef(false)
  const status = useStatusWord()

  const patient = state.patients.find((p) => p.id === draft?.report.patient_id)
  const ctx: Ctx | null = draft && patient
    ? { sex: patient.sex, age: ageOn(patient.birth_year, draft.report.report_date), report_id: draft.report.id, patient_id: patient.id, report_date: draft.report.report_date }
    : null

  const options = useMemo(() => TESTS.map((x) => ({ value: x.id, label: x.name, hint: panelName(lang, x.panel), keywords: x.aliases })), [lang])

  if (!draft || !ctx) return leaving.current ? null : <Navigate to="/" replace />
  const values = draft.values

  const counts = {
    found: values.length,
    auto: values.filter((v) => v.auto_matched).length,
    unrec: values.filter((v) => v.status === 'unrecognised').length,
    check: values.filter((v) => v.implausible).length,
  }
  const unread = draft.report.parse_notes?.unread ?? []
  const dateMissing = draft.report.parse_notes?.date_found === false && draft.report.report_date === draft.originalReport.report_date

  const replace = (next: LabValue) => dispatch({ type: 'draftValues', values: values.map((v) => (v.id === next.id ? { ...next, server_id: v.server_id, report_id: v.report_id, user_corrected: true } : v)) })

  const commit = (v: LabValue, field: Field, text: string): string | null => {
    const row = toRowInput(v)
    if (field === 'name') {
      if (!text.trim()) return t('people.name_needed')
      row.raw_name = text.trim()
      row.test_id = null
    } else if (field === 'value') {
      const p = parseValue(text)
      if (!p) return t('confirm.bad_value')
      row.value_num = p.num
      row.value_text = p.text
    } else if (field === 'unit') {
      row.unit = text.trim() || null
    } else {
      const r = parseRange(text)
      if (!r) return t('confirm.bad_range')
      row.ref_low = r.low
      row.ref_high = r.high
      row.ref_text = r.text
      row.has_range = r.low != null || r.high != null || !!r.text
    }
    replace(analyseRow(row, ctx, v.id))
    return null
  }

  const remap = (v: LabValue, testId: string) => {
    replace(analyseRow({ ...toRowInput(v), test_id: testId }, ctx, v.id))
    setMapping(null)
  }

  const remove = (id: string, index: number) => {
    const next = values.filter((v) => v.id !== id)
    dispatch({ type: 'draftValues', values: next })
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-remove-index="${Math.min(index, next.length - 1)}"]`) ?? addRef.current
      target?.focus()
    })
  }

  const addRow = () => {
    const id = uid()
    const v = analyseRow({ raw_name: t('confirm.new_row') }, ctx, id)
    dispatch({ type: 'draftValues', values: [...values, { ...v, user_corrected: true }] })
    setEditing({ id, field: 'name' })
  }

  const setReport = (patch: Partial<Pick<Report, 'report_date' | 'lab_name'>>) => {
    const report = { ...draft.report, ...patch }
    let next = values
    if (patch.report_date && patch.report_date !== draft.report.report_date && patient) {
      // The date is stored on every value (trends) and picks the age band for
      // fallback ranges, so every row is re-analysed.
      const c: Ctx = { ...ctx, report_date: patch.report_date, age: ageOn(patient.birth_year, patch.report_date) }
      next = values.map((v) => ({ ...analyseRow(toRowInput(v), c, v.id), server_id: v.server_id, report_id: v.report_id, user_corrected: v.user_corrected }))
    }
    dispatch({ type: 'draftReport', report, values: next })
  }

  const finish = () => {
    leaving.current = true
    void syncDraft(draft.report, draft.original, values, draft.originalReport)
    dispatch({ type: 'commitDraft' })
    nav(`/report/${draft.report.id}`)
  }

  const included = values.filter((v) => v.included).length
  const mapRow = values.find((v) => v.id === mapping) ?? null

  return (
    <div className="confirm page">
      <header className="page-head">
        <div>
          <h1 className="h2">{t('confirm.h2')}</h1>
          <p className="page-sub">{t('confirm.sub')}</p>
        </div>
        <div className="head-meta">
          {draft.report.sample && <SampleBadge />}
          <span className="meta num">{draft.report.lab_name} · {fmtDate(draft.report.report_date)}</span>
        </div>
      </header>

      {draft.parseFailed && (
        <div className="notice notice-warn" role="status">
          <CircleAlert size={22} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <p className="notice-title">{t('confirm.parsefail_title')}</p>
            <p>{t('confirm.parsefail_body')}</p>
          </div>
        </div>
      )}
      {draft.manual && (
        <div className="notice" role="status">
          <CircleAlert size={22} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <p className="notice-title">{t('confirm.manual_title')}</p>
            <p>{t('confirm.manual_body')}</p>
          </div>
        </div>
      )}

      <div className="card report-meta">
        <div className="field">
          <label htmlFor="rm-date" className="field-label">{t('confirm.report_date')}</label>
          <input
            id="rm-date" type="date" className="input num" value={draft.report.report_date}
            max={new Date().toISOString().slice(0, 10)}
            aria-invalid={dateMissing || undefined} aria-describedby={dateMissing ? 'rm-date-hint' : undefined}
            onChange={(e) => e.target.value && setReport({ report_date: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="rm-lab" className="field-label">{t('confirm.lab_name')}</label>
          <input id="rm-lab" className="input" value={draft.report.lab_name} maxLength={120} onChange={(e) => setReport({ lab_name: e.target.value })} />
        </div>
        {dateMissing && <p id="rm-date-hint" className="field-error rm-hint" role="status">{t('confirm.date_missing')}</p>}
      </div>

      <div className="summary-bar" role="status">
        <span className="num">{t('confirm.found', { n: counts.found })}</span>
        <span className="sep" aria-hidden="true">·</span>
        <span className="num chip-inline chip-amber-text">{t('confirm.auto', { n: counts.auto })}</span>
        <span className="sep" aria-hidden="true">·</span>
        <span className="num">{t('confirm.unrec', { n: counts.unrec })}</span>
        {counts.check > 0 && (
          <>
            <span className="sep" aria-hidden="true">·</span>
            <span className="num chip-inline chip-amber-text">{t('confirm.to_check', { n: counts.check })}</span>
          </>
        )}
      </div>

      {unread.length > 0 && (
        <details className="notice notice-warn unread">
          <summary className="notice-title">{t('confirm.unread_title', { n: unread.length })}</summary>
          <p>{t('confirm.unread_body')}</p>
          <ul className="unread-list num">{unread.map((line) => <li key={line}><code>{line}</code></li>)}</ul>
        </details>
      )}

      <div className="card table-card">
        <div className="table-wrap pin-first">
          <table className="data-table edit-table">
            <caption className="sr-only">{t('confirm.h2')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('confirm.col_name')}</th>
                <th scope="col" className="r">{t('confirm.col_value')}</th>
                <th scope="col">{t('confirm.col_unit')}</th>
                <th scope="col">{t('confirm.col_range')}</th>
                <th scope="col"><span className="sr-only">{t('confirm.col_actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {values.map((v, i) => {
                const qual = v.value_num == null && !!v.value_text
                const rangeDisplay = qual ? v.expected ?? '' : v.ref_source === 'none' ? '' : rangeLabel(v, t, false)
                const rangeEdit = qual ? v.expected ?? '' : v.ref_source === 'report' ? rangeInput(v) : ''
                return (
                  <tr key={v.id} className={cx(!v.included && 'excluded', v.user_corrected && 'corrected', v.implausible && 'needs-check')}>
                    <th scope="row" className="name-cell">
                      <div className="name-stack">
                        <EditableCell
                          label={t('confirm.edit', { field: t('confirm.col_name'), name: v.name })}
                          display={v.test_id ? v.name : v.raw_name}
                          initial={v.raw_name}
                          editing={editing?.id === v.id && editing.field === 'name'}
                          setEditing={(on) => setEditing(on ? { id: v.id, field: 'name' } : null)}
                          onCommit={(text) => commit(v, 'name', text)}
                        />
                        {v.auto_matched && <MatchChip kind="auto" raw={v.raw_name} name={v.name} onClick={() => setMapping(v.id)} />}
                        {v.status === 'unrecognised' && <MatchChip kind="unrec" raw={v.raw_name} name="" onClick={() => setMapping(v.id)} />}
                        {v.implausible && <CheckChip onClick={() => setEditing({ id: v.id, field: 'value' })} />}
                      </div>
                    </th>
                    <td className="r">
                      <div className="value-cell">
                        {v.included && <span className="live-status" title={t('confirm.status_now', { status: status(v.status, qual) })}><StatusIcon status={v.status} size={14} /><span className="sr-only">{t('confirm.status_now', { status: status(v.status, qual) })}</span></span>}
                        <EditableCell
                          label={t('confirm.edit', { field: t('confirm.col_value'), name: v.name })}
                          display={qual ? v.value_text ?? '' : fmtValue(v.value_num, v.decimals)}
                          initial={qual ? v.value_text ?? '' : v.value_num != null ? String(v.value_num) : ''}
                          editing={editing?.id === v.id && editing.field === 'value'}
                          setEditing={(on) => setEditing(on ? { id: v.id, field: 'value' } : null)}
                          onCommit={(text) => commit(v, 'value', text)}
                          numeric
                        />
                      </div>
                    </td>
                    <td>
                      <EditableCell
                        label={t('confirm.edit', { field: t('confirm.col_unit'), name: v.name })}
                        display={v.unit ?? ''}
                        initial={v.unit ?? ''}
                        editing={editing?.id === v.id && editing.field === 'unit'}
                        setEditing={(on) => setEditing(on ? { id: v.id, field: 'unit' } : null)}
                        onCommit={(text) => commit(v, 'unit', text)}
                      />
                    </td>
                    <td>
                      <EditableCell
                        label={t('confirm.edit', { field: t('confirm.col_range'), name: v.name })}
                        display={rangeDisplay || t('confirm.empty_range')}
                        muted={!rangeDisplay || v.ref_source === 'catalog'}
                        caption={v.ref_source === 'catalog' && !qual ? t('confirm.range_std') : undefined}
                        initial={rangeEdit}
                        editing={editing?.id === v.id && editing.field === 'range'}
                        setEditing={(on) => setEditing(on ? { id: v.id, field: 'range' } : null)}
                        onCommit={(text) => commit(v, 'range', text)}
                        numeric
                      />
                    </td>
                    <td className="actions-cell">
                      <button type="button" className="icon-btn" data-remove-index={i} onClick={() => remove(v.id, i)} aria-label={`${t('confirm.remove')}: ${v.test_id ? v.name : v.raw_name}`}>
                        <Trash size={18} strokeWidth={1.5} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <button ref={addRef} type="button" className="btn btn-ghost" onClick={addRow}>
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
            {t('confirm.add')}
          </button>
        </div>
      </div>

      <Disclaimer />

      <div className="sticky-actions" role="region" aria-label={t('confirm.col_actions')}>
        <div className="sticky-inner">
          <button type="button" className="btn btn-secondary" onClick={() => { leaving.current = true; if (draft.serverCreated) void api.deleteReport(draft.report); dispatch({ type: 'discardDraft' }); nav('/') }}>
            <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
            {t('confirm.back')}
          </button>
          <div className="sticky-right">
            {!included && <span className="field-hint">{t('confirm.need_rows')}</span>}
            <button type="button" className="btn btn-primary btn-lg" disabled={!included} onClick={finish}>
              {t('confirm.go')}
            </button>
          </div>
        </div>
      </div>

      <Modal open={!!mapRow} onClose={() => setMapping(null)} title={t('confirm.map')}>
        {mapRow && (
          <>
            <p className="modal-sub">
              {mapRow.auto_matched
                ? t('confirm.auto_tip', { raw: mapRow.raw_name, name: mapRow.name })
                : t('confirm.unrec_tip')}
            </p>
            <Combobox
              options={options}
              value={mapRow.test_id}
              onChange={(id) => remap(mapRow, id)}
              label={t('confirm.map_search')}
              placeholder={t('confirm.map_search')}
              emptyText={t('confirm.map_none')}
              autoFocus
              inline
            />
          </>
        )}
      </Modal>
    </div>
  )
}

function rangeInput(v: LabValue): string {
  const d = v.decimals
  if (v.ref_low != null && v.ref_high != null) return `${fmtValue(v.ref_low, d)} – ${fmtValue(v.ref_high, d)}`
  if (v.ref_high != null) return `< ${fmtValue(v.ref_high, d)}`
  if (v.ref_low != null) return `> ${fmtValue(v.ref_low, d)}`
  return ''
}

function CheckChip({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  const tipId = useId()
  return (
    <span className="tip-wrap">
      <button type="button" className="chip chip-btn chip-amber" onClick={onClick} aria-describedby={tipId}>
        <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
        {t('confirm.check_chip')}
      </button>
      <span id={tipId} role="tooltip" className="tooltip">{t('confirm.check_tip')}</span>
    </span>
  )
}

function MatchChip({ kind, raw, name, onClick }: { kind: 'auto' | 'unrec'; raw: string; name: string; onClick: () => void }) {
  const { t } = useI18n()
  const tipId = useId()
  const tip = kind === 'auto' ? t('confirm.auto_tip', { raw, name }) : t('confirm.unrec_tip')
  return (
    <span className="tip-wrap">
      <button type="button" className={cx('chip chip-btn', kind === 'auto' ? 'chip-amber' : 'chip-grey')} onClick={onClick} aria-describedby={tipId}>
        {kind === 'auto' && <WandSparkles size={14} strokeWidth={1.5} aria-hidden="true" />}
        {kind === 'auto' ? t('confirm.auto_chip') : t('confirm.unrec_chip')}
      </button>
      <span id={tipId} role="tooltip" className="tooltip">{tip}</span>
    </span>
  )
}

function EditableCell({ display, initial, editing, setEditing, onCommit, label, numeric, muted, caption }: {
  display: string
  initial: string
  editing: boolean
  setEditing: (on: boolean) => void
  onCommit: (text: string) => string | null
  label: string
  numeric?: boolean
  muted?: boolean
  caption?: string
}) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const errId = useId()

  useEffect(() => {
    if (editing) {
      setText(initial)
      setError(null)
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
    } else if (wasEditing.current) {
      requestAnimationFrame(() => btnRef.current?.focus())
    }
    wasEditing.current = editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const save = () => {
    if (text === initial) return setEditing(false)
    const err = onCommit(text)
    if (err) setError(err)
    else setEditing(false)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false) }
  }

  if (editing) {
    return (
      <span className="cell-edit">
        <input
          ref={inputRef}
          className={cx('input input-cell', numeric && 'num')}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null) }}
          onKeyDown={onKey}
          onBlur={save}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
        />
        {error && <span id={errId} className="cell-error" role="alert">{error}</span>}
      </span>
    )
  }
  return (
    <button ref={btnRef} type="button" className={cx('cell-btn', numeric && 'num', muted && 'muted')} onClick={() => setEditing(true)} aria-label={`${label}: ${display || '—'}`}>
      <span className="cell-text">{display || '—'}</span>
      {caption && <span className="cell-caption">{caption}</span>}
    </button>
  )
}
