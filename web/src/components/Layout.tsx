import { ChartLine, Check, FileText, ShieldCheck, Upload, UserPlus, Users } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LANGS, useI18n } from '../lib/i18n'
import { useStore } from '../lib/store'
import { cx, initials } from '../lib/util'
import { Footer, OfflineBanner, Toasts } from './Chrome'
import { Menu } from './Menu'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--green-700)" />
        <path d="M5 17h6l2.5-6 4 11 3-8 1.5 3H27" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="logo-word">Med<span>Simplify</span></span>}
    </span>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={cx('avatar', `avatar-${size}`)} aria-hidden="true">{initials(name)}</span>
}

function PersonSwitcher() {
  const { state, dispatch, activePatient } = useStore()
  const { t } = useI18n()
  const nav = useNavigate()
  if (!state.patients.length) return null
  return (
    <Menu
      triggerClass="person-btn"
      triggerLabel={`${t('nav.switch_person')}: ${activePatient?.name ?? ''}`}
      trigger={<><Avatar name={activePatient?.name ?? '?'} size="sm" /><span className="person-name">{activePatient?.name}</span></>}
      header={<div className="menu-header">{t('nav.viewing')}</div>}
      items={[
        ...state.patients.map((p) => ({
          key: p.id,
          label: p.name,
          checked: p.id === state.activePatientId,
          icon: p.id === state.activePatientId ? <Check size={16} strokeWidth={1.8} aria-hidden="true" /> : <Avatar name={p.name} size="sm" />,
          onSelect: () => dispatch({ type: 'activate', id: p.id }),
        })),
        { key: '__manage', label: t('nav.manage_people'), icon: <UserPlus size={18} strokeWidth={1.5} aria-hidden="true" />, onSelect: () => nav('/people') },
      ]}
    />
  )
}

export function LanguageSelect({ id = 'lang-select', compact = false }: { id?: string; compact?: boolean }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={cx('lang-select', compact && 'compact')}>
      <label htmlFor={id} className={compact ? 'sr-only' : 'field-label'}>{t('results.language')}</label>
      <select id={id} className="select" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.html}>{l.label}</option>)}
      </select>
    </div>
  )
}

const NAV = [
  { to: '/reports', key: 'nav.reports', icon: FileText },
  { to: '/trends', key: 'nav.trends', icon: ChartLine },
  { to: '/people', key: 'nav.people', icon: Users },
  { to: '/privacy', key: 'nav.privacy', icon: ShieldCheck },
] as const

export function Layout({ children }: { children: ReactNode }) {
  const { t, lang } = useI18n()
  const loc = useLocation()
  const bare = loc.pathname === '/' || loc.pathname === '/processing'

  useEffect(() => { document.documentElement.lang = LANGS.find((l) => l.code === lang)?.html ?? 'en' }, [lang])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [loc.pathname])

  return (
    <div className={cx('app', bare && 'app-bare')}>
      <a href="#main" className="skip-link">{t('app.skip')}</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="logo-link" aria-label={`${t('app.name')} — ${t('nav.upload')}`}><Logo /></Link>
          <div className="topbar-right">
            <LanguageSelect id="lang-top" compact />
            <PersonSwitcher />
            {!bare && (
              <Link to="/" className="btn btn-primary btn-sm topbar-upload">
                <Upload size={18} strokeWidth={1.5} aria-hidden="true" />
                <span className="hide-sm">{t('nav.upload')}</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      <OfflineBanner />
      <div className="shell">
        <nav className="sidebar" aria-label={t('nav.main')}>
          <ul>
            {NAV.map(({ to, key, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => cx('side-link', isActive && 'active')}>
                  <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                  <span>{t(key)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className="main" tabIndex={-1}>
          {children}
          <Footer />
        </main>
      </div>
      <nav className="tabbar" aria-label={t('nav.main')}>
        {NAV.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx('tab-link', isActive && 'active')}>
            <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
      <Toasts />
    </div>
  )
}
