import { ChevronDown, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { STATUS_RANK, isAbnormal, isCritical, levelOf } from '../lib/classify'
import { panelName, useI18n } from '../lib/i18n'
import type { LabValue, PanelId } from '../lib/types'
import { cx, fmtValue } from '../lib/util'
import { PanelIcon } from './PanelIcon'
import { RangeBar } from './RangeBar'
import { StatusIcon, StatusPill } from './Status'

export function usePanelSummary() {
  const { t } = useI18n()
  return (values: LabValue[]): string => {
    const inc = values.filter((v) => v.included)
    const ok = inc.filter((v) => v.status === 'normal').length
    const parts = [t('summary.n_of_m', { n: ok, m: inc.length })]
    const flagged = [...inc].filter((v) => isAbnormal(v.status)).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
    for (const v of flagged.slice(0, 2)) {
      if (v.value_num == null && v.value_text) parts.push(t('summary.qual_found', { test: v.name, value: v.value_text }))
      else if (isCritical(v.status)) parts.push(t('summary.is_critical', { test: v.name }))
      else {
        const key = ({ low: 'summary.is_low', high: 'summary.is_high', borderline_low: 'summary.is_slightly_low', borderline_high: 'summary.is_slightly_high' } as const)[v.status as 'low']
        parts.push(t(key, { test: v.name }))
      }
    }
    return parts.join(' ')
  }
}

export function ValueRow({ v, onOpen }: { v: LabValue; onOpen: (v: LabValue, el: HTMLElement) => void }) {
  const { t } = useI18n()
  const qual = v.value_num == null && !!v.value_text
  return (
    <li className={cx('value-row', `lvl-${levelOf(v.status)}`)}>
      <button type="button" className="value-row-btn" onClick={(e) => onOpen(v, e.currentTarget)} aria-label={t('results.open_detail', { name: v.name })}>
        <span className="vr-head">
          <span className="vr-name">{v.name}</span>
          <StatusPill status={v.status} qualitative={qual} size="sm" short implausible={v.implausible} />
        </span>
        <span className="vr-body">
          <span className="vr-value">
            <span className="value-lg num">{qual ? v.value_text : fmtValue(v.value_num, v.decimals)}</span>
            {v.unit && <span className="vr-unit">{v.unit}</span>}
          </span>
          <span className="vr-bar"><RangeBar v={v} /></span>
        </span>
        <ChevronRight className="vr-chevron" size={20} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </li>
  )
}

export function PanelCard({ panel, values, onOpen }: { panel: PanelId; values: LabValue[]; onOpen: (v: LabValue, el: HTMLElement) => void }) {
  const { t, lang } = useI18n()
  const summary = usePanelSummary()
  const anyFlag = values.some((v) => v.included && v.status !== 'normal')
  const [open, setOpen] = useState(anyFlag)
  const bodyId = useId()
  const sorted = [...values].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
  const worst = sorted[0]
  const name = panelName(lang, panel)
  return (
    <section className={cx('card panel-card', worst && `worst-${levelOf(worst.status)}`)} aria-labelledby={`${bodyId}-h`}>
      <header className="panel-head">
        <span className="panel-icon"><PanelIcon panel={panel} /></span>
        <div className="panel-titles">
          <h3 id={`${bodyId}-h`}>{name}</h3>
          <div className="dot-row" aria-hidden="true">
            {sorted.map((v) => <StatusIcon key={v.id} status={v.status} size={12} />)}
          </div>
        </div>
        <button type="button" className="icon-btn panel-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} aria-label={`${open ? t('results.collapse') : t('results.expand')}: ${name}`}>
          <ChevronDown size={22} strokeWidth={1.5} className={cx('chev', open && 'up')} />
        </button>
      </header>
      <p className="panel-summary">{summary(values)}</p>
      <div id={bodyId} className={cx('panel-body', open && 'open')} hidden={!open}>
        <ul className="value-list">
          {sorted.map((v) => <ValueRow key={v.id} v={v} onOpen={onOpen} />)}
        </ul>
      </div>
    </section>
  )
}
