import { Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/util'

export interface Option {
  value: string
  label: string
  hint?: string
  keywords?: string[]
  icon?: ReactNode
}

/** Searchable single-select (ARIA 1.2 combobox + listbox). Arrow keys move,
 *  Enter selects, Escape closes. */
export function Combobox({ options, value, onChange, label, placeholder, emptyText, autoFocus, inline = false, id: idProp }: {
  options: Option[]
  value: string | null
  onChange: (value: string) => void
  label: string
  placeholder?: string
  emptyText: string
  autoFocus?: boolean
  inline?: boolean // list always visible (used inside a popover)
  id?: string
}) {
  const autoId = useId()
  const id = idProp ?? autoId
  const listId = `${id}-list`
  const selected = options.find((o) => o.value === value)
  const [query, setQuery] = useState(inline ? '' : selected?.label ?? '')
  const [open, setOpen] = useState(inline)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef(false)

  useEffect(() => { if (!inline && !open) setQuery(selected?.label ?? '') }, [selected, open, inline])

  const filtered = useMemo(() => {
    const q = typed.current ? query.trim().toLowerCase() : ''
    if (!q) return options
    return options.filter((o) => [o.label, o.hint ?? '', ...(o.keywords ?? [])].some((s) => s.toLowerCase().includes(q)))
  }, [options, query])

  useEffect(() => { setActive(Math.max(0, filtered.findIndex((o) => o.value === value))) }, [filtered, value])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (o: Option) => {
    onChange(o.value)
    typed.current = false
    if (!inline) {
      setOpen(false)
      setQuery(o.label)
    }
  }

  return (
    <div className={cx('combobox', inline && 'inline')}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="combo-input-wrap">
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="combo-search-icon" />
        <input
          ref={inputRef}
          id={id}
          className="input combo-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onFocus={(e) => { if (!inline) { setOpen(true); e.currentTarget.select() } }}
          onBlur={() => { if (!inline) window.setTimeout(() => setOpen(false), 120) }}
          onChange={(e) => { typed.current = true; setQuery(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); choose(filtered[active]) }
            else if (e.key === 'Escape' && !inline && open) { e.stopPropagation(); setOpen(false) }
          }}
        />
      </div>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="combo-list">
          {filtered.length === 0 && <li className="combo-empty" role="presentation">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              className={cx('combo-option', i === active && 'active', o.value === value && 'selected')}
              onMouseDown={(e) => { e.preventDefault(); choose(o) }}
              onMouseEnter={() => setActive(i)}
            >
              {o.icon}
              <span className="combo-label">{o.label}</span>
              {o.hint && <span className="combo-hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
