'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

export type SegOption = { value: string; label: ReactNode }

/**
 * Contrôle segmenté avec pastille dorée glissante (filtres ou onglets).
 * - role="tablist" → boutons role="tab" + aria-selected
 * - role="group"   → boutons aria-pressed
 */
export function Seg({
  options,
  value,
  onChange,
  role = 'group',
  ariaLabel,
  className = '',
  controls,
}: {
  options: SegOption[]
  value: string
  onChange: (value: string) => void
  role?: 'group' | 'tablist'
  ariaLabel: string
  className?: string
  /** id du panneau contrôlé (onglets) */
  controls?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const place = () => {
      const on = root.querySelector<HTMLElement>('[data-on="true"]')
      if (!on || !pill.current) return
      pill.current.style.width = `${on.offsetWidth}px`
      pill.current.style.transform = `translateX(${on.offsetLeft}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(root)
    document.fonts?.ready.then(place).catch(() => {})
    return () => ro.disconnect()
  }, [value, options.length])

  const select = (v: string, el: HTMLButtonElement) => {
    onChange(v)
    const root = ref.current
    if (root && root.scrollWidth > root.clientWidth + 2) {
      root.scrollTo({ left: el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (role !== 'tablist' || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length]
    const btn = ref.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)
    if (btn) {
      btn.focus()
      select(next.value, btn)
    }
  }

  return (
    <div ref={ref} className={`seg ${className}`} role={role} aria-label={ariaLabel} onKeyDown={onKeyDown}>
      <span ref={pill} className="seg__pill" aria-hidden="true" />
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            data-value={o.value}
            data-on={on}
            {...(role === 'tablist'
              ? { role: 'tab', 'aria-selected': on, tabIndex: on ? 0 : -1, 'aria-controls': controls }
              : { 'aria-pressed': on })}
            onClick={(e) => select(o.value, e.currentTarget)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
