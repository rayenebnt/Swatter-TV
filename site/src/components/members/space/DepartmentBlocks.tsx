// « Mon espace » : blocs du tableau de bord liés au département du membre (météo, info, sorties), composants serveur.
import Link from 'next/link'
import { EventCard } from '@/components/agenda/EventCard'
import { agendaUrl } from '@/components/agenda/utils'
import { ArticleImage } from '@/components/info/ArticleImage'
import { toTeaser } from '@/components/info/utils'
import { getMeteo } from '@/components/meteo/data'
import { PauseOffscreen } from '@/components/meteo/PauseOffscreen'
import { WeatherIcon } from '@/components/meteo/WeatherIcon'
import { Icon } from '@/components/ui/Icon'
import { renderNow } from '@/components/video/utils'
import { departmentLabel, type DepartmentSlug } from '@/lib/departments'
import { formatTemp, KIND_LABEL, meteoHref } from '@/lib/meteo'
import { inPlace, ofPlace } from '@/lib/places'
import { getArticlesPage } from '@/lib/queries/articles'
import { getAgendaPage } from '@/lib/queries/events'
import { departmentUrl } from '@/lib/urls'
import { SpaceBlock, SpaceEmpty } from './SpaceBlock'
import '@/styles/meteo.css'

/** « Ma météo » : temps du jour dans la ville suivie du département, puis les trois jours suivants. */
export async function MeteoBlock({ dept }: { dept: DepartmentSlug }) {
  const data = await getMeteo(dept)
  const day = data?.days[0]
  const href = meteoHref(dept)
  const more = { href, label: 'Prévisions', sr: `météo ${inPlace(dept)}` }
  if (!data || !day || day.date !== data.today) {
    return (
      <SpaceBlock id="ma-meteo" title="Ma météo" subtitle={departmentLabel(dept)} more={more} className="space-meteo">
        <SpaceEmpty icon="now" title="Prévisions momentanément indisponibles">
          Elles reviennent dans un instant&nbsp;: retrouvez <Link href={href}>la météo {ofPlace(dept)}</Link>.
        </SpaceEmpty>
      </SpaceBlock>
    )
  }
  const { main } = day
  // libellé court de la ville (« Éclaircies »), celui du jour pouvant être une phrase
  const label = day.cities.find((c) => c.name === main.city)?.label ?? KIND_LABEL[main.kind]
  const next = data.days.slice(1, 4)
  return (
    <SpaceBlock id="ma-meteo" title="Ma météo" subtitle={`${departmentLabel(dept)} · aujourd’hui`} more={more} className="space-meteo">
      <PauseOffscreen className="space-meteo__box">
        <div className="space-meteo__now">
          <WeatherIcon kind={main.kind} decorative className="space-meteo__icon" />
          <div>
            <p className="space-meteo__city">
              <Icon name="pin" />
              {main.city}
            </p>
            <p className="space-meteo__temp">
              <span className="sr-only">Température actuelle&nbsp;: </span>
              {formatTemp(main.now)}
            </p>
            <p className="space-meteo__label">{label}</p>
            <p className="space-meteo__mm">
              Min {formatTemp(main.min)} · Max {formatTemp(main.max)}
            </p>
          </div>
        </div>
        {next.length > 0 && (
          <ul className="space-meteo__days" aria-label="Les jours suivants">
            {next.map((d) => (
              <li key={d.date}>
                <span className="space-meteo__day">
                  <span aria-hidden="true">{d.short}</span>
                  <span className="sr-only">
                    {d.weekday} {d.dayMonth}
                  </span>
                </span>
                <WeatherIcon kind={d.main.kind} />
                <span className="space-meteo__range">
                  <b>
                    <span className="sr-only">maximum </span>
                    {formatTemp(d.main.max)}
                  </b>
                  <span>
                    <span className="sr-only">minimum </span>
                    {formatTemp(d.main.min)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PauseOffscreen>
    </SpaceBlock>
  )
}

/** « L'info de mon département » : les trois derniers articles publiés. */
export async function NewsBlock({ dept }: { dept: DepartmentSlug }) {
  const { docs } = await getArticlesPage(dept, 1, 3, null)
  const teasers = docs.map((a) => toTeaser(a, { image: false, thumb: true, excerpt: false }))
  const href = departmentUrl(dept)
  return (
    <SpaceBlock id="mon-info" title="L’info de mon département" subtitle={departmentLabel(dept)} more={{ href, sr: `l’info ${ofPlace(dept)}` }}>
      {teasers.length ? (
        <ul className="space-list">
          {teasers.map((t) => (
            <li key={t.id}>
              <article className="card space-news">
                <div className="space-news__thumb">{t.thumb && <ArticleImage image={t.thumb} alt="" sizes="104px" />}</div>
                <div className="space-news__body">
                  <p className="kicker">{t.kicker}</p>
                  <h3>
                    <Link className="stretched" href={t.href}>
                      {t.title}
                    </Link>
                  </h3>
                  <p className="space-news__time">
                    <Icon name="clock" />
                    <time dateTime={t.publishedAt} title={t.full}>
                      {t.short}
                    </time>
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <SpaceEmpty icon="news" title="Pas d’article récent pour ce département">
          Consultez <Link href="/info">l’actualité de toute la région</Link>.
        </SpaceEmpty>
      )}
    </SpaceBlock>
  )
}

/** « Sorties près de chez moi » : les trois prochains événements du département. */
export async function OutingsBlock({ dept }: { dept: DepartmentSlug }) {
  const { docs } = await getAgendaPage({ department: dept, limit: 3 })
  const href = agendaUrl({ department: dept })
  const now = new Date(renderNow())
  return (
    <SpaceBlock id="mes-sorties" title="Sorties près de chez moi" subtitle={departmentLabel(dept)} more={{ href, sr: `les sorties ${inPlace(dept)}` }}>
      {docs.length ? (
        <ul className="space-list">
          {docs.map((e, i) => (
            <li key={e.id}>
              <EventCard event={e} now={now} index={i} />
            </li>
          ))}
        </ul>
      ) : (
        <SpaceEmpty icon="cal" title="Aucune sortie annoncée pour l’instant">
          De nouveaux rendez-vous arrivent chaque semaine&nbsp;: voir <Link href="/agenda">l’agenda de toute la région</Link>.
        </SpaceEmpty>
      )}
    </SpaceBlock>
  )
}
