import { CircleAlert, Info, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isDemo } from '../lib/demo'
import { useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { LabValue } from '../lib/types'
import { cx, fmtValue } from '../lib/util'

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <p className={cx('disclaimer', compact && 'compact')}>
      <Info size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{t('disclaimer')}</span>
    </p>
  )
}

export function SampleBadge() {
  const { t } = useI18n()
  return (
    <span className="sample-badge" title={t('app.sample_badge_hint')}>
      <span className="sample-dot" aria-hidden="true" />
      {t('app.sample_badge')}
      <span className="sr-only">. {t('app.sample_badge_hint')}</span>
    </span>
  )
}

/** Never dismissible. Names the test(s) and value(s). */
export function CriticalBanner({ values }: { values: LabValue[] }) {
  const { t } = useI18n()
  if (!values.length) return null
  return (
    <section className="critical-banner" role="alert" aria-labelledby="crit-title">
      <svg className="crit-icon" width="28" height="28" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.2 15.2 14H.8Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        <path d="M8 5.6v4.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="8" cy="11.9" r="0.95" fill="#fff" />
      </svg>
      <div>
        <p id="crit-title" className="crit-text">{values.length > 1 ? t('results.critical_banner_many') : t('results.critical_banner')}</p>
        <ul className="crit-list">
          {values.map((v) => (
            <li key={v.id} className="num">
              {t('results.critical_item', { name: v.name, value: v.value_num != null ? fmtValue(v.value_num, v.decimals) : v.value_text ?? '', unit: v.unit ?? '' })}
              <span className="crit-range"> · {t(v.status === 'critical_low' ? 'status.critical_low' : 'status.critical_high')}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online && !isDemo('offline')
}

export function OfflineBanner() {
  const { t } = useI18n()
  const online = useOnline()
  if (online) return null
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={18} strokeWidth={1.5} aria-hidden="true" />
      <span>{t('offline.banner')}</span>
    </div>
  )
}

export function Toasts() {
  const { state, dispatch } = useStore()
  const { t } = useI18n()
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {state.toasts.map((toast) => (
        <div key={toast.id} className={cx('toast', toast.tone === 'info' && 'info')} role="status">
          {toast.tone === 'info' ? <CircleAlert size={18} strokeWidth={1.5} aria-hidden="true" /> : (
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="m4.8 8.2 2.1 2.1 4.3-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
          <span>{toast.text}</span>
          <button className="icon-btn sm" onClick={() => dispatch({ type: 'dismissToast', id: toast.id })} aria-label={t('toast.dismiss')}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="site-footer">
      <Disclaimer compact />
      <p className="loinc">{t('footer.loinc')}</p>
      <p className="loinc">{t('footer.no_analytics')}</p>
    </footer>
  )
}

export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('skeleton-card', className)} aria-hidden="true">
      <span className="sk sk-title" />
      {Array.from({ length: lines }, (_, i) => <span key={i} className="sk sk-line" style={{ width: `${88 - i * 14}%` }} />)}
      <span className="sk sk-bar" />
    </div>
  )
}
