'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { useSegFade } from './useSegFade'

export type DeptLink = { href: string; label: string; current: boolean }

/**
 * Filtres des pages Info : un lien par département (adresses partageables), au style du contrôle segmenté.
 * Composant client pour le seul confort de défilement (fondu des bords, lien actif amené en vue).
 */
export function DeptLinks({ links }: { links: DeptLink[] }) {
  const ref = useRef<HTMLElement>(null)
  useSegFade(ref, links.length)
  if (links.length < 2) return null
  return (
    <nav ref={ref} className="info-filters info-depts" aria-label="L’info par département" data-reveal>
      <div className="seg seg--bleed">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} scroll={false}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
