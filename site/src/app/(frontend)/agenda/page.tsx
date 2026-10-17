import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AgendaFilterBar } from '@/components/agenda/AgendaFilters'
import { AgendaPager } from '@/components/agenda/AgendaPager'
import { EventCard } from '@/components/agenda/EventCard'
import { EventFeature } from '@/components/agenda/EventFeature'
import { AGENDA_VISUAL, agendaUrl, categoryFilterLabel, dateLabel, monthLabel } from '@/components/agenda/utils'
import { AdSlot } from '@/components/layout/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { PageHeader, type Crumb } from '@/components/ui/PageHeader'
import { SectionHead } from '@/components/ui/SectionHead'
import { EVENT_CATEGORIES } from '@/lib/categories'
import { parisDay } from '@/lib/format'
import {
  EVENT_PERIODS,
  getAgendaHighlights,
  getAgendaPage,
  getUpcomingCategories,
  isEventCategory,
  isEventPeriod,
  parisDayStart,
  periodRange,
  type EventCategory,
  type EventListItem,
  type EventPeriod,
} from '@/lib/queries/events'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { eventUrl } from '@/lib/urls'
import '@/styles/agenda.css'
import { ogImage } from '@/lib/og'

export const revalidate = 60

const PER_PAGE = 24
const INTRO = 'Toute l’offre culturelle, touristique et sportive en Haute-Savoie et dans les Alpes\u00a0: fêtes, marchés, concerts, expositions et sorties en famille.'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** ?categorie= et ?quand= (ignorés si inconnus), ?page= (1 par défaut). */
function parseParams(sp: Record<string, string | string[] | undefined>): { category: EventCategory | null; period: EventPeriod | null; page: number } {
  const c = first(sp.categorie)
  const q = first(sp.quand)
  const p = Number(first(sp.page))
  return { category: isEventCategory(c) ? c : null, period: isEventPeriod(q) ? q : null, page: Number.isInteger(p) && p > 1 ? p : 1 }
}

const periodLabel = (period: EventPeriod) => EVENT_PERIODS.find((p) => p.value === period)?.label ?? ''

/** « du samedi 17 au dimanche 18 octobre » */
function periodDates(period: EventPeriod, now: Date): string {
  const { from, to } = periodRange(period, now)
  const label = dateLabel({ startDate: from.toISOString(), endDate: to.toISOString() })
  return label.charAt(0).toLowerCase() + label.slice(1)
}

function texts(category: EventCategory | null, period: EventPeriod | null, page: number) {
  const cat = category ? categoryFilterLabel(category) : null
  const when = period ? periodLabel(period).toLowerCase() : null
  const suffix = page > 1 ? ` (page ${page})` : ''
  const quoted = cat && `«\u00a0${cat}\u00a0»`
  const parts = [quoted, when].filter(Boolean)
  return {
    cat,
    title: `${parts.length ? `Agenda ${parts.join(', ')}` : 'Agenda des sorties en Haute-Savoie'}${suffix}`,
    description: parts.length
      ? `Les sorties ${parts.join(' ')} en Haute-Savoie et dans les Alpes\u00a0: dates, lieux et programmes, avec Swatter TV.`
      : `${INTRO} Dates, lieux et programmes avec Swatter TV.`,
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { category, period, page } = parseParams(await searchParams)
  const { title, description } = texts(category, period, page)
  // Les filtres de période changent chaque jour : l'adresse de référence ne les garde pas
  const canonical = period ? agendaUrl({ category }) : agendaUrl({ category, page })
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url: canonical, title, description, images: [ogImage(null, AGENDA_VISUAL)] },
  }
}

/** Regroupe les événements par mois (un événement déjà commencé compte dans le mois en cours). */
function byMonth(events: EventListItem[], now: Date) {
  const today = parisDayStart(now).getTime()
  const groups: { key: string; events: EventListItem[] }[] = []
  for (const e of events) {
    const key = parisDay(new Date(Math.max(Date.parse(e.startDate), today))).slice(0, 7)
    const last = groups.at(-1)
    if (last?.key === key) last.events.push(e)
    else groups.push({ key, events: [e] })
  }
  return groups
}

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, period, page } = parseParams(await searchParams)
  const now = new Date()
  const filtered = Boolean(category || period)
  const withFeature = !filtered && page === 1
  const [list, categories, highlights] = await Promise.all([
    getAgendaPage({ category, period, page, limit: PER_PAGE, now }),
    getUpcomingCategories(now),
    withFeature ? getAgendaHighlights(0) : Promise.resolve(null),
  ])
  if (page > 1 && page > list.totalPages) notFound()

  const { cat } = texts(category, period, page)
  const feature = highlights?.feature ?? null
  const crumbs: Crumb[] = [{ label: 'Agenda', href: '/agenda' }, ...(cat ? [{ label: cat }] : [])]
  const groups = byMonth(list.docs, now)
  const count = list.totalDocs
  // La catégorie demandée reste proposée (active) même sans événement à venir
  const shownCategories = EVENT_CATEGORIES.map((c) => c.value).filter((c) => categories.includes(c) || c === category)

  return (
    <>
      <PageHeader eyebrow="Sortir en Haute-Savoie" title={cat ? `Agenda «\u00a0${cat}\u00a0»` : 'Agenda'} description={INTRO} crumbs={crumbs} />

      {feature && (
        <>
          <section className="section section--tight container" aria-labelledby="agenda-pick-title">
            <SectionHead eyebrow={feature.isWeekendPick ? 'Sortie du week-end' : 'Prochainement'} title="À ne pas manquer" titleId="agenda-pick-title" />
            <EventFeature event={feature} wide priority />
          </section>
          <div className="container">
            <AdSlot placement="inner-leaderboard" />
          </div>
        </>
      )}

      <section className={`section container${feature ? '' : ' section--tight'}`} aria-labelledby="agenda-all-title">
        <SectionHead eyebrow={count ? `${count} événement${count > 1 ? 's' : ''} à venir` : undefined} title={filtered ? 'Événements à venir' : 'Tous les événements'} titleId="agenda-all-title" />
        <div className="agenda-filters" data-reveal>
          <AgendaFilterBar
            label="Filtrer par période"
            links={[
              { href: agendaUrl({ category }), label: 'Toutes les dates', current: !period },
              ...EVENT_PERIODS.map((p) => ({ href: agendaUrl({ category, period: p.value }), label: p.label, current: p.value === period })),
            ]}
          />
          <AgendaFilterBar
            label="Filtrer par catégorie"
            links={[
              { href: agendaUrl({ period }), label: 'Toutes les catégories', current: !category },
              ...shownCategories.map((c) => ({ href: agendaUrl({ category: c, period }), label: categoryFilterLabel(c), current: c === category })),
            ]}
          />
        </div>
        {period && (
          <p className="agenda-period">
            <b>{periodLabel(period)}</b>&nbsp;: {periodDates(period, now)}
          </p>
        )}

        {groups.length ? (
          groups.map((g, gi) => (
            <section key={g.key} className="agenda-month" aria-labelledby={`mois-${g.key}`}>
              <h2 className="agenda-month__title" id={`mois-${g.key}`}>
                {monthLabel(g.key)}
                <span>
                  {g.events.length} événement{g.events.length > 1 ? 's' : ''}
                </span>
              </h2>
              <div className="agenda-grid">
                {g.events.map((e, i) => (
                  <EventCard key={e.id} event={e} now={now} variant="poster" index={i % 4} priority={!feature && gi === 0 && i === 0} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="empty agenda-empty">
            <Icon name="cal" />
            <p>
              <b>{filtered ? 'Aucun événement ne correspond à ces critères' : 'Aucun événement à venir pour le moment'}</b>
              {filtered ? (
                <>
                  Essayez une autre période ou une autre catégorie, ou <Link href="/agenda">consultez tout l’agenda</Link>.
                </>
              ) : (
                'Revenez bientôt pour découvrir les prochaines sorties en Haute-Savoie.'
              )}
            </p>
          </div>
        )}
        <AgendaPager page={page} totalPages={list.totalPages} hrefFor={(p) => agendaUrl({ category, period, page: p })} />
      </section>

      {!feature && (
        <div className="container">
          <AdSlot placement="inner-leaderboard" />
        </div>
      )}

      {list.docs.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: cat ? `Agenda «\u00a0${cat}\u00a0» — ${SITE_NAME}` : `Agenda des sorties — ${SITE_NAME}`,
            itemListElement: list.docs.map((e, i) => ({ '@type': 'ListItem', position: (page - 1) * PER_PAGE + i + 1, url: absoluteUrl(eventUrl(e)), name: e.title })),
          }}
        />
      )}
    </>
  )
}
