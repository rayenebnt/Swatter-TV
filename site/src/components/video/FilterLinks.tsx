'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

export type FilterLink = { href: string; label: string; current: boolean }

/**
 * Filtres sous forme de liens (adresses partageables) avec le style du contrôle segmenté.
 * Barre défilante (mobile) : le filtre actif est ramené au centre après chaque navigation. Liens sans préchargement : Next 16 réutiliserait la tête de page préchargée (titre, canonique) d'une autre adresse de la
 * même page.
 */
export function FilterLinks({ label, links }: { label: string; links: FilterLink[] }) {
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
    <nav className="vfilters" aria-label={label} data-reveal>
      <div ref={ref} className="seg seg--links seg--bleed">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} scroll={false} prefetch={false}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
