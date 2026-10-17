import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { mediaAlt } from '@/lib/media'
import type { EventFeatureItem } from '@/lib/queries/events'
import { eventUrl } from '@/lib/urls'
import { DateChip } from './DateChip'
import { eventVisual, frenchSpaces, isMultiDay, shortWhen, timeLabel } from './utils'
import '@/styles/agenda.css'

const SIZES = '(max-width: 760px) 92vw, (max-width: 1100px) 46vw, 420px'
const WIDE_SIZES = '(max-width: 760px) 92vw, (max-width: 1100px) 46vw, 640px'
/** Moments du programme affichés sur la carte (la fiche les montre tous). */
const MAX_SCHED = 3

/** Événement mis en avant (carte « feature » de la maquette) : affiche, date, lieu, présentation et programme. */
export function EventFeature({
  event,
  headingLevel: Heading = 'h3',
  wide = false,
  priority = false,
}: {
  event: EventFeatureItem
  headingLevel?: 'h2' | 'h3'
  /** Pleine largeur (page Agenda) : affiche moins recadrée */
  wide?: boolean
  /** Image principale de la page (préchargée) */
  priority?: boolean
}) {
  const title = frenchSpaces(event.title)
  const program = (event.program ?? []).filter((p) => p.time?.trim() && p.label?.trim())
  const where = [event.city?.trim(), event.place?.trim()].filter(Boolean).join(' · ')
  const multi = isMultiDay(event)
  // En-tête de la date : programme s'il existe, sinon horaires (ou dates pour plusieurs jours)
  const lead = program.length ? (multi ? 'Au programme' : 'Programme de la journée') : multi ? shortWhen(event, 'upcoming') : timeLabel(event)
  const description = event.description?.trim()

  return (
    <article className={wide ? 'card feature feature--wide' : 'card feature'} data-reveal>
      <div className="media">
        <MediaImage media={event.poster} fill priority={priority} sizes={wide ? WIDE_SIZES : SIZES} alt={mediaAlt(event.poster, `Affiche\u00a0: ${event.title}`)} fallbackSrc={eventVisual(event.id)} />
      </div>
      <div className="card__body">
        <div className="when">
          <DateChip event={event} />
          <div className="when__txt">
            {lead && <b>{lead}</b>}
            {where}
          </div>
        </div>
        <Heading className="card__title">
          <Link className="stretched" href={eventUrl(event)}>
            {title}
          </Link>
        </Heading>
        {description && <p className="feature__desc">{frenchSpaces(description)}</p>}
        {program.length > 0 && (
          <ul className="sched">
            {program.slice(0, MAX_SCHED).map((p, i) => (
              <li key={p.id ?? i}>
                <b>{p.time.trim()}</b>
                {frenchSpaces(p.label.trim())}
              </li>
            ))}
          </ul>
        )}
        {/* Toute la carte mène à la fiche (lien du titre) : le bouton n'est qu'un repère visuel */}
        <span className="btn btn--gold btn--sm" aria-hidden="true">
          Voir le détail <Icon name="arrow" />
        </span>
      </div>
    </article>
  )
}
