import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DateChip } from '@/components/agenda/DateChip'
import { EventCard } from '@/components/agenda/EventCard'
import {
  dateLabel,
  eventKicker,
  eventStatus,
  eventVisual,
  frenchSpaces,
  httpUrl,
  paragraphs,
  parisIso,
  timeLabel,
} from '@/components/agenda/utils'
import { AdSlot } from '@/components/layout/AdSlot'
import { SaveButton } from '@/components/members/SaveButton'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { MediaImage } from '@/components/ui/MediaImage'
import { SectionHead } from '@/components/ui/SectionHead'
import { mediaAlt, mediaUrl, type MediaRef } from '@/lib/media'
import { getEventBySlug, getUpcomingEvents } from '@/lib/queries/events'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { eventUrl } from '@/lib/urls'
import type { Event } from '@/payload-types'
import '@/styles/agenda.css'
import { ogImage } from '@/lib/og'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache. */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ slug: string }>

const POSTER_SIZES = '(max-width: 760px) 92vw, (max-width: 1100px) 40vw, 540px'

/** Image de partage : celle du SEO, sinon l'affiche. */
const shareMedia = (e: Event): MediaRef => (e.meta?.image && typeof e.meta.image === 'object' ? e.meta.image : e.poster)

/** « Samedi 17 octobre 2026 · Bourg-Saint-Maurice » */
function describe(e: Event): string {
  const text = e.meta?.description?.trim() || e.description?.trim()
  if (text) return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text
  return `${dateLabel(e, true)} à ${e.city}${e.place ? ` (${e.place})` : ''}\u00a0: toutes les informations sur «\u00a0${e.title}\u00a0» dans l’agenda de Swatter TV Info.`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) return { title: 'Événement introuvable', robots: { index: false, follow: true } }
  const url = eventUrl(event)
  const media = shareMedia(event)
  const title = event.meta?.title?.trim()
  return {
    // Le titre SEO saisi (ou généré) contient déjà « — Swatter TV »
    title: title ? { absolute: title } : event.title,
    description: describe(event),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url,
      title: title || event.title,
      description: describe(event),
      images: [ogImage(media, eventVisual(event.id), mediaAlt(media, event.title))],
    },
  }
}

export default async function EventPage({ params }: { params: Params }) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  const now = new Date()
  const others = await getUpcomingEvents(4, event.id, now)
  const status = eventStatus(event, now)
  const title = frenchSpaces(event.title)
  const city = event.city?.trim()
  const place = event.place?.trim()
  const time = timeLabel(event)
  const program = (event.program ?? []).filter((p) => p.time?.trim() && p.label?.trim())
  const description = paragraphs(event.description)
  const external = httpUrl(event.externalUrl)
  const url = absoluteUrl(eventUrl(event))
  const poster = mediaUrl(event.poster)
  const crumbs = [{ label: 'Accueil', href: '/' }, { label: 'Agenda', href: '/agenda' }, { label: event.title }]

  return (
    <>
      <div className="ev-page">
        <div className="container">
          <nav aria-label="Fil d’Ariane">
            <ol className="crumbs">
              {crumbs.map((c, i) => (
                <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
              ))}
            </ol>
          </nav>

          <article className="ev" aria-labelledby="ev-title">
            <header className="ev__head">
              <div className="ev__tags">
                <p className="kicker">{eventKicker(event.category)}</p>
                {status === 'past' && <span className="badge badge--glass badge--sm">Événement terminé</span>}
                {status === 'ongoing' && <span className="badge badge--gold badge--sm">En cours</span>}
                {status === 'upcoming' && event.isWeekendPick && <span className="badge badge--gold badge--sm">Sortie du week-end</span>}
              </div>
              <h1 className="ev__title" id="ev-title">
                {title}
              </h1>
              <div className="when">
                <DateChip event={event} />
                <div className="when__txt">
                  <b>{dateLabel(event, true)}</b>
                  {time}
                </div>
              </div>
              {(place || city) && (
                <div className="when ev__where">
                  <span className="ev__pin" aria-hidden="true">
                    <Icon name="pin" />
                  </span>
                  <p className="when__txt">
                    <span className="sr-only">Lieu&nbsp;: </span>
                    <b>{place || city}</b>
                    {place && city}
                  </p>
                </div>
              )}
            </header>

            <div className="ev__poster">
              <MediaImage media={event.poster} priority sizes={POSTER_SIZES} alt={mediaAlt(event.poster, `Affiche\u00a0: ${event.title}`)} fallbackSrc={eventVisual(event.id)} />
            </div>

            <div className="ev__main">
              {status === 'past' && (
                <p className="ev__notice">
                  <Icon name="cal" />
                  <span>
                    Cet événement est terminé. Découvrez les <Link href="/agenda">prochaines sorties de l’agenda</Link>.
                  </span>
                </p>
              )}
              {description.length > 0 && (
                <div className="ev__desc">
                  {description.map((p, i) => (
                    <p key={i}>{frenchSpaces(p)}</p>
                  ))}
                </div>
              )}

              {program.length > 0 && (
                <section className="ev__prog" aria-labelledby="ev-prog-title">
                  <h2 id="ev-prog-title">Programme</h2>
                  <ul className="sched">
                    {program.map((p, i) => (
                      <li key={p.id ?? i}>
                        <b>{p.time.trim()}</b>
                        {frenchSpaces(p.label.trim())}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="ev__actions">
                {external && (
                  <a className="btn btn--gold" href={external} target="_blank" rel="noopener noreferrer">
                    Plus d’informations
                    <span className="sr-only"> (nouvel onglet)</span>
                    <Icon name="arrow" />
                  </a>
                )}
                {/* « Ma liste » de l'espace membres (même hauteur que les boutons voisins) */}
                <SaveButton kind="event" id={event.id} title={event.title} size="md" />
                <Link className="btn btn--ghost" href="/agenda">
                  <Icon name="cal" />
                  Tout l’agenda
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      {others.length > 0 && (
        <section className="section container" aria-labelledby="ev-others-title">
          <SectionHead eyebrow="Sortir dans la région" title={status === 'past' ? 'Les prochains événements' : 'À venir aussi'} titleId="ev-others-title">
            <Link className="link-more" href="/agenda">
              Tout l’agenda <Icon name="arrow" />
            </Link>
          </SectionHead>
          <div className="agenda-grid">
            {others.map((e, i) => (
              <EventCard key={e.id} event={e} now={now} variant="poster" index={i} />
            ))}
          </div>
        </section>
      )}

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: event.title,
          url,
          startDate: parisIso(event.startDate),
          ...(event.endDate ? { endDate: parisIso(event.endDate) } : {}),
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: {
            '@type': 'Place',
            name: place || city,
            address: { '@type': 'PostalAddress', addressLocality: city, addressRegion: 'Auvergne-Rhône-Alpes', addressCountry: 'FR' },
          },
          image: [absoluteUrl(poster ?? eventVisual(event.id))],
          ...(event.description?.trim() ? { description: event.description.trim() } : {}),
          ...(external ? { sameAs: external } : {}),
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, ...(c.href ? { item: absoluteUrl(c.href) } : {}) })),
        }}
      />
    </>
  )
}
