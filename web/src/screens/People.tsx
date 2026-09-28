import { Pencil, Trash, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SampleBadge } from '../components/Chrome'
import { Avatar } from '../components/Layout'
import { Modal } from '../components/Overlay'
import { PersonForm } from '../components/PersonForm'
import { StatusPill } from '../components/Status'
import { STATUS_RANK } from '../lib/classify'
import { useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import { ageOn, cx, fmtDate } from '../lib/util'
import { analyseRow, toRowInput } from '../lib/analyse'
import { api } from '../lib/api'
import type { Patient } from '../lib/types'
import { EmptyState } from './States'

export default function People() {
  const { t } = useI18n()
  const { state, dispatch, toast } = useStore()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)
  const [deleting, setDeleting] = useState<Patient | null>(null)

  const saveEdit = (p: Patient) => {
    // Sex and birth year pick the fallback ranges: re-analyse every value.
    const values = state.values.filter((v) => v.patient_id === p.id).map((v) => {
      const r = state.reports.find((x) => x.id === v.report_id)
      const date = r?.report_date ?? v.report_date
      return {
        ...analyseRow(toRowInput(v), { sex: p.sex, age: ageOn(p.birth_year, date), report_id: v.report_id, patient_id: p.id, report_date: date }, v.id),
        server_id: v.server_id, user_corrected: v.user_corrected,
      }
    })
    dispatch({ type: 'editPatient', patient: p, values })
    void api.updatePatient(p)
    setEditing(null)
    toast(t('people.updated', { name: p.name }))
  }

  const confirmDelete = () => {
    if (!deleting) return
    void api.deletePatient(deleting)
    dispatch({ type: 'deletePatient', id: deleting.id })
    toast(t('people.deleted', { name: deleting.name }))
    setDeleting(null)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="h2">{t('people.h2')}</h1>
          <p className="page-sub">{t('people.sub')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <UserPlus size={18} strokeWidth={1.5} aria-hidden="true" />
          {t('people.add')}
        </button>
      </header>

      {state.patients.length === 0 ? (
        <EmptyState art="people" title={t('people.empty')} action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>{t('people.add')}</button>} />
      ) : (
        <ul className="people-grid">
          {state.patients.map((p) => {
            const reports = state.reports.filter((r) => r.patient_id === p.id).sort((a, b) => b.report_date.localeCompare(a.report_date))
            const latest = reports[0]
            const worst = latest
              ? state.values.filter((v) => v.report_id === latest.id && v.included).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0]
              : undefined
            const active = p.id === state.activePatientId
            return (
              <li key={p.id} className={cx('card person-card', active && 'active')}>
                <div className="pc-top">
                  <Avatar name={p.name} size="lg" />
                  <div>
                    <h2 className="h3">{p.name}</h2>
                    <p className="muted num">{t('people.age', { age: ageOn(p.birth_year) })} · {t(`results.sex.${p.sex}`)}</p>
                  </div>
                </div>
                {p.sample && <SampleBadge />}
                <dl className="pc-facts">
                  <div><dt>{t('nav.reports')}</dt><dd className="num">{reports.length === 1 ? t('people.reports_one') : t('people.reports', { n: reports.length })}</dd></div>
                  <div><dt>{t('people.overall')}</dt><dd className="num">{latest ? fmtDate(latest.report_date) : t('people.no_reports')}</dd></div>
                </dl>
                {worst && <StatusPill status={worst.status} short />}
                <div className="pc-actions">
                  {active ? <span className="chip chip-green">{t('people.active')}</span> : null}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { dispatch({ type: 'activate', id: p.id }); nav('/reports') }}>
                    {t('people.view')}
                  </button>
                </div>
                <div className="pc-manage">
                  {!p.sample && (
                    <button type="button" className="link-btn" onClick={() => setEditing(p)} aria-label={`${t('people.edit')}: ${p.name}`}>
                      <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />{t('people.edit')}
                    </button>
                  )}
                  <button type="button" className="link-btn danger" onClick={() => setDeleting(p)} aria-label={`${t('people.delete')}: ${p.name}`}>
                    <Trash size={16} strokeWidth={1.5} aria-hidden="true" />{t('people.delete')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('people.edit_title')}>
        {editing && <PersonForm key={editing.id} initial={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('people.delete_title', { name: deleting?.name ?? '' })}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)} data-autofocus>{t('results.cancel')}</button>
            <button type="button" className="btn btn-danger" onClick={confirmDelete}>{t('people.delete_confirm')}</button>
          </>
        }
      >
        <p>{t('people.delete_body', { name: deleting?.name ?? '', n: deleting ? state.reports.filter((r) => r.patient_id === deleting.id).length : 0 })}</p>
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title={t('people.add')}>
        <PersonForm
          onCancel={() => setAdding(false)}
          onSave={(p) => {
            dispatch({ type: 'addPatient', patient: p, activate: true })
            setAdding(false)
            toast(t('people.added', { name: p.name }))
          }}
        />
      </Modal>
    </div>
  )
}
