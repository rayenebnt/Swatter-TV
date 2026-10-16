import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Rail, RailArrows } from '@/components/ui/Rail'
import { SectionHead } from '@/components/ui/SectionHead'
import '@/styles/video.css'

/** Section avec rail de cartes (vidéos ou replays associés) : en-tête, lien « Tout voir » facultatif et flèches. */
export function RelatedRail({ id, eyebrow, title, more, kind = 'videos', children }: { id: string; eyebrow?: string; title: string; more?: { href: string; label: string }; kind?: 'videos' | 'replay'; children: ReactNode }) {
  const titleId = `${id}-title`
  return (
    <section className="section container" aria-labelledby={titleId}>
      <SectionHead eyebrow={eyebrow} title={title} titleId={titleId}>
        {more && (
          <Link className="link-more" href={more.href}>
            {more.label} <Icon name="arrow" />
          </Link>
        )}
        <RailArrows target={id} />
      </SectionHead>
      <div data-reveal>
        <Rail id={id} className={kind === 'replay' ? 'rail-replay' : 'rail-videos'} label={title}>
          {children}
        </Rail>
      </div>
    </section>
  )
}
