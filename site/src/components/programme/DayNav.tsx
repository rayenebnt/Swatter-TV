'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef } from 'react'

export type DayLink = { href: string; label: string; long: string; current: boolean }

/** Liens vers les jours du programme (vue liste) ; sur mobile, le jour affiché est ramené dans le champ du bandeau défilant. */
export function DayNav({ links }: { links: DayLink[] }) {
  const ref = useRef<HTMLElement>(null)
  const current = links.findIndex((l) => l.current)

  useLayoutEffect(() => {
    const nav = ref.current
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth + 2) return
    nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2
  }, [current])

  return (
    <nav ref={ref} className="seg tvl-days" aria-label="Choisir le jour du programme">
      {links.map((l) => (
        <Link key={l.href} href={l.href} scroll={false} aria-current={l.current ? 'page' : undefined}>
          {l.label}
          <span className="sr-only"> ({l.long})</span>
        </Link>
      ))}
    </nav>
  )
}
