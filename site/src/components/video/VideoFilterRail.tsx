'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Rail, RailArrows } from '@/components/ui/Rail'
import { SectionHead } from '@/components/ui/SectionHead'
import { Seg, type SegOption } from '@/components/ui/Seg'

export type FilterItem = { key: string; category: string; card: ReactNode }

const ALL = 'all'

/**
 * En-tête + rail « Vidéos du jour » avec filtre par catégorie (côté client, comme la maquette).
 * Les cartes sont rendues par le serveur et passées telles quelles : seul le filtre est interactif.
 */
export function VideoFilterRail({ railId, title, titleId, eyebrow, options, items }: { railId: string; title: string; titleId: string; eyebrow?: string; options: SegOption[]; items: FilterItem[] }) {
  const [cat, setCat] = useState(ALL)
  const shown = useRef(ALL)
  const visible = items.filter((it) => cat === ALL || it.category === cat)

  useEffect(() => {
    // Rien à faire au montage (ni au double montage du mode strict) : seulement quand le filtre change
    if (shown.current === cat) return
    shown.current = cat
    const rail = document.getElementById(railId)
    if (!rail) return
    // Retour au début du rail et mise à jour des flèches (le contenu a changé sans défilement)
    rail.scrollLeft = 0
    rail.dispatchEvent(new Event('scroll'))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Apparition en cascade des cartes affichées (transform / opacity uniquement)
    const anims = [...rail.querySelectorAll<HTMLElement>('.rail__cell:not([hidden])')].map((el, i) =>
      el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)' }, { opacity: 1, transform: 'none' }], {
        duration: 600,
        delay: i * 50,
        easing: 'cubic-bezier(.16, 1, .3, 1)',
        fill: 'backwards',
      }),
    )
    return () => anims.forEach((a) => a.cancel())
  }, [cat, railId])

  return (
    <>
      <SectionHead eyebrow={eyebrow} title={title} titleId={titleId}>
        {options.length > 1 && <Seg ariaLabel="Filtrer les vidéos" value={cat} onChange={setCat} options={[{ value: ALL, label: 'Tout' }, ...options]} />}
        <RailArrows target={railId} />
      </SectionHead>
      <p className="sr-only" aria-live="polite">
        {`${visible.length} vidéo${visible.length > 1 ? 's' : ''} affichée${visible.length > 1 ? 's' : ''}`}
      </p>
      <div data-reveal>
        <Rail id={railId} className="rail-videos" label={title}>
          {items.map((it) => (
            <div key={it.key} className="rail__cell" hidden={cat !== ALL && it.category !== cat}>
              {it.card}
            </div>
          ))}
        </Rail>
      </div>
    </>
  )
}
