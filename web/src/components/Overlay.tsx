import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../lib/i18n'
import { cx } from '../lib/util'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Traps Tab inside `ref` while open, closes on Escape, and returns focus to
 *  whatever had it before the overlay opened. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Record the opener during render: children with autoFocus move focus into
  // the overlay during commit, before any effect of ours could see the opener.
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current && typeof document !== 'undefined') opener.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const previous = opener.current
    const node = ref.current
    const focusFirst = () => {
      const target = initial?.current ?? node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE) ?? node
      target?.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(focusFirst)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [open, ref, initial])
}

export function Modal({ open, onClose, title, children, footer, size = 'md', dismissible = true, describedBy }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
  dismissible?: boolean
  describedBy?: string
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, open, () => dismissible && onClose())
  if (!open) return null
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose() }}>
      <div ref={ref} className={cx('modal', `modal-${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">{title}</h2>
          {dismissible && (
            <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
              <X size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Right-hand drawer on >= 900px, bottom sheet below. */
export function Drawer({ open, onClose, label, children, footer }: { open: boolean; onClose: () => void; label: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, onClose)
  if (!open) return null
  return createPortal(
    <div className="overlay overlay-drawer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="drawer-handle" aria-hidden="true" />
        <button className="icon-btn drawer-close" onClick={onClose} aria-label={t('drawer.close')}>
          <X size={22} strokeWidth={1.5} />
        </button>
        <div className="drawer-scroll">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
