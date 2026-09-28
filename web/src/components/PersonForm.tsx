import { Info } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n'
import type { Patient, Sex } from '../lib/types'
import { uid } from '../lib/util'

/** Adults only in v1: reference ranges for children differ and are not seeded. */
export function PersonForm({ onSave, onCancel, submitLabel, initial }: { onSave: (p: Patient) => void; onCancel?: () => void; submitLabel?: string; initial?: Patient }) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [sex, setSex] = useState<Sex | ''>(initial?.sex ?? '')
  const [year, setYear] = useState(initial ? String(initial.birth_year) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const thisYear = new Date().getFullYear()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const y = Number(year)
    if (!name.trim()) errs.name = t('people.name_needed')
    if (!sex) errs.sex = t('people.sex_hint')
    if (!/^\d{4}$/.test(year) || y < 1900 || y > thisYear) errs.year = t('people.bad_year')
    else if (thisYear - y < 18) errs.year = t('people.too_young')
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]
      document.getElementById(`pf-${first}`)?.focus()
      return
    }
    onSave(initial
      ? { ...initial, name: name.trim(), sex: sex as Sex, birth_year: y }
      : { id: uid(), name: name.trim(), sex: sex as Sex, birth_year: y, created_at: new Date().toISOString() })
  }

  return (
    <form className="person-form" onSubmit={submit} noValidate>
      <p className="note"><Info size={18} strokeWidth={1.5} aria-hidden="true" /> {t('people.adults_only')}</p>
      <div className="field">
        <label htmlFor="pf-name" className="field-label">{t('people.name')}</label>
        <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'pf-name-err' : undefined} data-autofocus />
        {errors.name && <p id="pf-name-err" className="field-error">{errors.name}</p>}
      </div>
      <fieldset className="field" aria-describedby="pf-sex-hint">
        <legend className="field-label">{t('people.sex')}</legend>
        <div className="seg" id="pf-sex" role="radiogroup" tabIndex={-1}>
          {(['F', 'M'] as Sex[]).map((s) => (
            <label key={s} className="seg-opt">
              <input type="radio" name="pf-sex" value={s} checked={sex === s} onChange={() => setSex(s)} />
              <span>{t(`results.sex.${s}`)}</span>
            </label>
          ))}
        </div>
        <p id="pf-sex-hint" className={errors.sex ? 'field-error' : 'field-hint'}>{t('people.sex_hint')}</p>
      </fieldset>
      <div className="field">
        <label htmlFor="pf-year" className="field-label">{t('people.birth_year')}</label>
        <input id="pf-year" className="input input-short num" inputMode="numeric" maxLength={4} placeholder="1956" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} aria-invalid={!!errors.year} aria-describedby={errors.year ? 'pf-year-err' : undefined} />
        {errors.year && <p id="pf-year-err" className="field-error">{errors.year}</p>}
      </div>
      <div className="form-actions">
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('people.cancel')}</button>}
        <button type="submit" className="btn btn-primary">{submitLabel ?? t('people.save')}</button>
      </div>
    </form>
  )
}
