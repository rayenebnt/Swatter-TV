import Image from 'next/image'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { SectionHead } from '@/components/ui/SectionHead'
import { formatTime } from '@/lib/format'
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/site'
import { getProgrammeWeek } from './data'
import { DayNav } from './DayNav'
import {
  dayLabel,
  dayLong,
  EVENING_PARTS,
  eveningPart,
  formatDuration,
  isAfterMidnight,
  minutesBetween,
  programImage,
  programmeDays,
  programmeDayUrl,
  slotsOfEvening,
} from './model'
import { SlotStatus } from './SlotStatus'
import '@/styles/programme.css'

/**
 * Vue liste du programme d'une soirée (de 18 h à 0 h 30, mêmes créneaux que la frise : rognés à l'antenne, ceux hors
 * antenne ignorés), rendue par le serveur : accessible, indexable, pratique sur mobile. Deux parties (début de soirée,
 * soirée), une mention « après minuit » pour la fin de soirée, liens vers les 7 soirées (?jour=) et données
 * structurées ItemList de BroadcastEvent.
 */
export async function ProgramList({ day, today }: { day: string; today: string }) {
  const slots = slotsOfEvening(await getProgrammeWeek(today), day)
  const long = dayLong(day)
  const parts = EVENING_PARTS.map((p) => ({ ...p, slots: slots.filter((s) => eveningPart(s.start, day) === p.value) })).filter((p) => p.slots.length)

  return (
    <section className="section container" id="liste" aria-labelledby="liste-title">
      <SectionHead
        eyebrow={day === today ? 'Ce soir' : 'Soirée par soirée'}
        title={`Programme de la soirée du ${long}`}
        titleId="liste-title"
        subtitle={`${SITE_NAME} est à l’antenne tous les soirs de 18\u00a0h à 0\u00a0h\u00a030 (heure de Paris).`}
      >
        <DayNav links={programmeDays(today).map((d) => ({ href: `${programmeDayUrl(d, today)}#liste`, label: dayLabel(d, today, Date.now()), long: dayLong(d), current: d === day }))} />
      </SectionHead>

      {parts.length ? (
        <div className="tvl" data-reveal>
          {parts.map((part) => (
            <div key={part.value} className="tvl__part">
              <h3>{part.label}</h3>
              <ol role="list">
                {part.slots.map((s) => (
                  <li key={s.id} className="tvl__row" data-preview={`slot-${s.id}`}>
                    <p className="tvl__time">
                      <time dateTime={s.start}>{formatTime(s.start)}</time>
                      <span>
                        – <time dateTime={s.end}>{formatTime(s.end)}</time>
                      </span>
                      {/* 00:15 dans la soirée de la veille : l'heure seule prêterait à confusion */}
                      {isAfterMidnight(s.start, day) && <small className="tvl__night">après minuit</small>}
                    </p>
                    <div className="tvl__thumb">
                      <Image src={programImage(s)} alt="" width={168} height={95} />
                    </div>
                    <div className="tvl__body">
                      <p className="tvl__meta">
                        {s.genreLabel && <span className="kicker">{s.genreLabel}</span>}
                        {s.isPremiere && <span className="badge badge--gold badge--sm">Inédit</span>}
                        <SlotStatus start={s.start} end={s.end} />
                      </p>
                      <h4 className="tvl__title">{s.title}</h4>
                      {s.synopsis && <p className="tvl__desc">{s.synopsis}</p>}
                      <p className="tvl__dur">
                        <Icon name="clock" />
                        {formatDuration(minutesBetween(s.start, s.end))}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="cal" />
          <p>
            <b>Aucun programme ce soir-là</b>
            Le programme des soirées est mis en ligne au fil de la semaine&nbsp;: revenez bientôt.
          </p>
        </div>
      )}

      {slots.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `Programme TV de ${SITE_NAME}, soirée du ${long}`,
            url: absoluteUrl(programmeDayUrl(day, today)),
            numberOfItems: slots.length,
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            itemListElement: slots.map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'BroadcastEvent',
                name: s.title,
                description: s.synopsis || undefined,
                image: s.image ? absoluteUrl(s.image) : undefined,
                startDate: s.start,
                endDate: s.end,
                inLanguage: 'fr',
                isAccessibleForFree: true,
                eventStatus: 'https://schema.org/EventScheduled',
                eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
                location: { '@type': 'VirtualLocation', url: absoluteUrl('/direct') },
                organizer: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
                publishedOn: { '@type': 'BroadcastService', name: SITE_NAME, broadcastDisplayName: SITE_NAME, url: SITE_URL },
              },
            })),
          }}
        />
      )}
    </section>
  )
}
