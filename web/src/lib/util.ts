export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function ageOn(birthYear: number, isoDate?: string): number {
  const year = isoDate ? Number(isoDate.slice(0, 4)) : new Date().getFullYear()
  return year - birthYear
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Numbers always render in Latin digits — that is how labs print them. */
export function fmt(n: number | null | undefined, decimals?: number): string {
  if (n == null || Number.isNaN(n)) return '—'
  const d = decimals ?? (Number.isInteger(n) ? 0 : Math.min(3, (String(n).split('.')[1] ?? '').length))
  return n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** Keep the decimals as printed, but show at least one when the test is
 *  reported to one place (so a range bound of 12 renders as 12.0 for Hb). */
export function fmtValue(n: number | null | undefined, decimals?: number): string {
  if (n == null) return '—'
  const printed = (String(n).split('.')[1] ?? '').length
  return fmt(n, Math.max(printed, Math.min(decimals ?? 0, 1)))
}

/** Month names follow the chosen language; digits stay Latin (-u-nu-latn),
 *  which is how Indian labs print dates. Set by the i18n provider. */
let dateLocale = 'en-IN'
export const setDateLocale = (locale: string) => { dateLocale = locale }

export function fmtDate(iso: string, locale: string = dateLocale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale, opts)
}

export function pct(a: number, b: number): number | null {
  if (!a) return null
  return ((b - a) / a) * 100
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
