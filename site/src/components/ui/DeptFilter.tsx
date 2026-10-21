'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { useSegFade } from './useSegFade'

export type DeptLink = { href: string; label: string; current: boolean }

/**
 * Filtre par département (Info, Agenda, Webcams, Météo) : « Toute la région » puis un lien par département (adresses
 * partageables), au style du contrôle segmenté. Composant client pour le seul confort de défilement (fondu des bords,
 * lien actif amené en vue). Rien à afficher sans au moins deux choix. Liens sans préchargement : Next 16 réutiliserait la tête de page préchargée (titre, canonique) d'une autre adresse de la
 * même page.
 */
export function DeptFilter({ links, label, className }: { links: DeptLink[]; label: string; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  useSegFade(ref, links.length)
  if (links.length < 2) return null
  return (
    <nav ref={ref} className={className ? `dept-filter ${className}` : 'dept-filter'} aria-label={label} data-reveal>
      <div className="seg seg--bleed">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} scroll={false} prefetch={false}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
