import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/util'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  checked?: boolean
}

/** Menu button (ARIA APG pattern): arrows move, Enter/Space selects,
 *  Escape closes and returns focus to the trigger. */
export function Menu({ trigger, triggerLabel, items, align = 'end', triggerClass, header }: {
  trigger: ReactNode
  triggerLabel: string
  items: MenuItem[]
  align?: 'start' | 'end'
  triggerClass?: string
  header?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = (focus = true) => {
    setOpen(false)
    if (focus) btn.current?.focus()
  }

  return (
    <div className="menu-wrap">
      <button
        ref={btn}
        type="button"
        className={cx('icon-btn', triggerClass)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={triggerLabel}
        onClick={() => { setActive(0); setOpen((o) => !o) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(e.key === 'ArrowDown' ? 0 : items.length - 1)
            setOpen(true)
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={triggerLabel}
          className={cx('menu', `align-${align}`)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length) }
            else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
            else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
            else if (e.key === 'Tab') close(false)
          }}
        >
          {header}
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              aria-checked={it.checked}
              tabIndex={i === active ? 0 : -1}
              className={cx('menu-item', it.danger && 'danger', it.checked && 'checked')}
              onClick={() => { close(); it.onSelect() }}
              onMouseEnter={() => setActive(i)}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
