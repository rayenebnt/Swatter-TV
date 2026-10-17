import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { SectionHead } from '@/components/ui/SectionHead'
import { getAgendaHighlights } from '@/lib/queries/events'
import { EventCard } from './EventCard'
import { EventFeature } from './EventFeature'
import '@/styles/agenda.css'

/** Section « Agenda » de l'accueil : la sortie mise en avant et les prochains événements. Masquée sans événement à venir. */
export async function AgendaSection() {
  const { feature, others } = await getAgendaHighlights(4)
  if (!feature) return null
  const now = new Date()
  return (
    <section className="section container" id="agenda" aria-labelledby="agenda-title">
      <SectionHead eyebrow="Sortir en Haute-Savoie" title="Agenda" titleId="agenda-title" subtitle="Toute l’offre culturelle, touristique et sportive en Haute-Savoie.">
        <Link className="link-more" href="/agenda">
          Tout l’agenda <Icon name="arrow" />
        </Link>
      </SectionHead>
      <div className={others.length ? 'agenda' : 'agenda agenda--solo'}>
        <EventFeature event={feature} />
        {others.length > 0 && (
          <div className="events">
            {others.map((e, i) => (
              <EventCard key={e.id} event={e} now={now} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
