import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import type { EventListItem } from '@/lib/queries/events'
import { eventUrl } from '@/lib/urls'
import { DateChip } from './DateChip'
import { eventKicker, eventStatus, eventVisual, frenchSpaces, posterThumbSizes, shortWhen, untilLabel } from './utils'
import '@/styles/agenda.css'

export const POSTER_CARD_SIZES = '(max-width: 760px) 140px, (max-width: 1100px) 46vw, 330px'

/**
 * Carte d'événement réutilisable.
 * - `row` : carte de la maquette (pastille de date, catégorie, titre, commune) ;
 * - `poster` : carte avec l'affiche (page Agenda, autres événements), compacte sur mobile.
 */
export function EventCard({
  event,
  now,
  variant = 'row',
  index = 0,
  sizes = POSTER_CARD_SIZES,
  priority = false,
}: {
  event: EventListItem
  now: Date
  variant?: 'row' | 'poster'
  index?: number
  sizes?: string
  /** Première image visible de la page (préchargée) */
  priority?: boolean
}) {
  const title = frenchSpaces(event.title)
  const city = event.city?.trim()
  const kicker = eventKicker(event.category)
  const href = eventUrl(event)
  const style = { '--d': index } as CSSProperties

  if (variant === 'row') {
    const until = untilLabel(event)
    return (
      <article className="card event" data-reveal style={style}>
        <DateChip event={event} />
        <div>
          <p className="kicker">{kicker}</p>
          <h3>
            <Link className="stretched" href={href}>
              {title}
            </Link>
          </h3>
          {(city || until) && (
            <p>
              <Icon name="pin" />
              {[city, until].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </article>
    )
  }

  const status = eventStatus(event, now)
  const visual = eventVisual(event.id)
  return (
    <article className="card ecard" data-reveal style={style}>
      <div className="media">
        {/* Carte 16:9 : déclinaison « card » (découpée autour du point focal) ; vignette presque carrée sur téléphone :
            affiche d'origine cadrée sur son point focal, plutôt qu'une seconde découpe de la bande 16:9 */}
        <MediaImage
          media={event.poster}
          size="card"
          fill
          priority={priority}
          sizes={sizes}
          alt=""
          fallbackSrc={visual}
          mobile={{ media: event.poster, sizes: posterThumbSizes(event.poster), fallbackSrc: visual }}
        />
        <DateChip event={event} className="ecard__chip" />
        {status !== 'upcoming' && <span className="badge badge--glass badge--sm ecard__status">{status === 'ongoing' ? 'En cours' : 'Terminé'}</span>}
      </div>
      <div className="card__body">
        <p className="kicker">{kicker}</p>
        <h3 className="card__title">
          <Link className="stretched" href={href}>
            {title}
          </Link>
        </h3>
        <div className="card__meta">
          {city && (
            <span>
              <Icon name="pin" />
              {city}
            </span>
          )}
          <span>
            <Icon name="clock" />
            {shortWhen(event, status)}
          </span>
        </div>
      </div>
    </article>
  )
}
