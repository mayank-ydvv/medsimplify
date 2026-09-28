import { levelOf } from '../lib/classify'
import { useI18n } from '../lib/i18n'
import type { Level, Status } from '../lib/types'
import { cx } from '../lib/util'

/**
 * Status is never colour alone. Each level has its own shape:
 *   normal     filled circle
 *   borderline half-filled circle
 *   abnormal   triangle (points up for high, down for low)
 *   critical   filled triangle with an exclamation mark
 *   unknown    dashed circle
 */
export function StatusIcon({ status, size = 16, className }: { status: Status; size?: number; className?: string }) {
  const level = levelOf(status)
  const down = status === 'low' || status === 'borderline_low'
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true as const, className: cx('status-icon', `lvl-${level}`, className), focusable: false as const }
  switch (level) {
    case 'normal':
      return <svg {...common}><circle cx="8" cy="8" r="6" fill="currentColor" /></svg>
    case 'borderline':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M2.4 8a5.6 5.6 0 0 0 11.2 0Z" fill="currentColor" />
        </svg>
      )
    case 'abnormal':
      return (
        <svg {...common}>
          <path d={down ? 'M8 13.6 2.2 3.4h11.6Z' : 'M8 2.4 13.8 12.6H2.2Z'} fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
    case 'critical':
      return (
        <svg {...common}>
          <path d="M8 1.2 15.2 14H.8Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          <path d="M8 5.6v4.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="8" cy="11.9" r="0.95" fill="#fff" />
        </svg>
      )
    default:
      return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 2" /></svg>
  }
}

export function useStatusWord() {
  const { t } = useI18n()
  return (status: Status, qualitative = false, short = false): string => {
    if (qualitative) {
      if (status === 'normal') return t('status.qual_normal')
      if (status === 'borderline_high') return t('status.qual_borderline')
      if (status === 'high') return t('status.qual_high')
    }
    if (short && (status === 'critical_high' || status === 'critical_low')) return t('status.critical_short')
    return t(`status.${status}` as 'status.normal')
  }
}

export function StatusPill({ status, qualitative = false, size = 'md', short = false, implausible = false }: { status: Status; qualitative?: boolean; size?: 'sm' | 'md' | 'lg'; short?: boolean; implausible?: boolean }) {
  const word = useStatusWord()
  const { t } = useI18n()
  const level: Level = levelOf(status)
  return (
    <span className={cx('pill', `lvl-${level}`, `pill-${size}`)}>
      <StatusIcon status={status} size={size === 'lg' ? 18 : 14} />
      <span>{implausible ? t('status.implausible') : word(status, qualitative, short)}</span>
    </span>
  )
}
