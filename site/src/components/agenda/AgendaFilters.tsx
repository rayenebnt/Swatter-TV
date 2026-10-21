'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

export type AgendaFilterLink = { href: string; label: string; current: boolean }

/**
 * Barre de filtres sous forme de liens (adresses partageables), au style du contrôle segmenté.
 * Sur mobile la barre défile : le filtre actif est ramené au centre après chaque navigation.
 */
export function AgendaFilterBar({ label, links }: { label: string; links: AgendaFilterLink[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const current = links.find((l) => l.current)?.href

  useEffect(() => {
    const bar = ref.current
    const active = bar?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return
    bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2
  }, [current])

  if (links.length < 2) return null
  return (
    <nav aria-label={label}>
      <div ref={ref} className="seg seg--bleed">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} scroll={false}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
