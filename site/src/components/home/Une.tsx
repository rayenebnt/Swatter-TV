import Link from 'next/link'
import type { CSSProperties } from 'react'
import { MiniMeteo } from '@/components/meteo/MiniMeteo'
import { Icon } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { SectionHead } from '@/components/ui/SectionHead'
import { labelOf, VIDEO_CATEGORIES } from '@/lib/categories'
import { formatDayLong, formatTime, timeAgo } from '@/lib/format'
import { getInfoOfDay, getVideoOfDay, getWeekendEvent, type HomeArticle, type HomeEvent, type HomeVideo } from '@/lib/queries/home'
import { articleUrl, eventUrl, videoUrl } from '@/lib/urls'
import '@/styles/une.css'

const DAY_MS = 24 * 60 * 60 * 1000
const delay = (d: number) => ({ '--d': d }) as CSSProperties
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « 2:14 » → « 02:14 » (les durées longues « 1:34:00 » restent telles quelles). */
function formatDuration(d: string | null | undefined): string | null {
  const v = d?.trim()
  if (!v) return null
  const parts = v.split(':')
  return parts.length === 2 ? `${parts[0].padStart(2, '0')}:${parts[1]}` : v
}

/** Grande tuile : vidéo du jour (ou dernière vidéo). */
function VideoTile({ video, now }: { video: HomeVideo; now: Date }) {
  const duration = formatDuration(video.duration)
  const category = labelOf(VIDEO_CATEGORIES, video.category)
  const fresh = now.getTime() - new Date(video.publishedAt).getTime() < DAY_MS
  return (
    <article className="tile tile--xl b-video" data-reveal style={delay(0)}>
      <MediaImage
        media={video.thumbnail}
        fallbackSrc="/visuels/t-ete-a.webp"
        size="card"
        fill
        sizes="(max-width: 1100px) calc(100vw - 32px), 560px"
      />
      <div className="tile__top">
        <span className="badge badge--gold">{video.isVideoOfDay ? 'Vidéo du jour' : 'Dernière vidéo'}</span>
        {duration && (
          <span className="badge badge--glass">
            <span className="sr-only">Durée :</span>
            {duration}
          </span>
        )}
      </div>
      <span className="bigplay" aria-hidden="true">
        <Icon name="play" />
      </span>
      <div className="tile__body">
        {category && <p className="kicker">{category}</p>}
        <h3 className="tile__title">
          <Link className="stretched" href={videoUrl(video)}>
            {video.title}
          </Link>
        </h3>
        <div className="tile__meta">
          <span>
            <Icon name="clock" />
            <time dateTime={video.publishedAt}>{timeAgo(video.publishedAt, now)}</time>
          </span>
          {fresh && <span className="badge badge--new badge--sm">Nouveau</span>}
        </div>
      </div>
    </article>
  )
}

/** Tuile haute : sortie du week-end (ou prochain événement). */
function EventTile({ event }: { event: HomeEvent }) {
  const time = formatTime(event.startDate)
  const when = `${cap(formatDayLong(event.startDate))}${time === '00:00' ? '' : ` · ${time.replace(':', 'h')}`}`
  return (
    <article className="tile b-sortie" data-reveal style={delay(1)}>
      <MediaImage
        media={event.poster}
        fallbackSrc="/visuels/t-matin-a.webp"
        size="card"
        fill
        sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 50vw, 460px"
      />
      <div className="tile__top">
        <span className="badge badge--gold">{event.isWeekendPick ? 'Sortie du week-end' : 'Prochaine sortie'}</span>
      </div>
      <div className="tile__body">
        <p className="kicker">{event.city ? `Agenda · ${event.city}` : 'Agenda'}</p>
        <h3 className="tile__title">
          <Link className="stretched" href={eventUrl(event)}>
            {event.title}
          </Link>
        </h3>
        <div className="tile__meta">
          <span>
            <Icon name="cal" />
            <time dateTime={event.startDate}>{when}</time>
          </span>
        </div>
      </div>
    </article>
  )
}

/** Petite tuile : info du jour (ou dernier article). */
function InfoTile({ article }: { article: HomeArticle }) {
  return (
    <article className="tile b-info" data-reveal style={delay(2)}>
      <MediaImage
        media={article.image}
        fallbackSrc="/visuels/t-nuages-a.webp"
        size="card"
        fill
        sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 50vw, 340px"
      />
      <div className="tile__top">
        <span className="badge badge--gold">{article.isInfoOfDay ? 'L’info du jour' : 'Dernière info'}</span>
      </div>
      <div className="tile__body">
        <h3 className="tile__title">
          <Link className="stretched" href={articleUrl(article)}>
            {article.title}
          </Link>
        </h3>
      </div>
    </article>
  )
}

/**
 * Mosaïque « À la une » : vidéo du jour, sortie du week-end, info du jour et météo express.
 * Une tuile sans données disparaît ; la grille (une.css) se réorganise selon les tuiles présentes.
 */
export async function Une() {
  const now = new Date()
  const [video, event, article] = await Promise.all([getVideoOfDay(), getWeekendEvent(), getInfoOfDay()])
  if (!video && !event && !article) return null

  return (
    <section className="section container une" aria-labelledby="une-title">
      <SectionHead eyebrow="Aujourd’hui" title="À la une" titleId="une-title">
        <Link className="link-more" href="/videos">
          Toutes les vidéos <Icon name="arrow" />
        </Link>
      </SectionHead>
      <div className="bento">
        {video && <VideoTile video={video} now={now} />}
        {event && <EventTile event={event} />}
        {article && <InfoTile article={article} />}
        {/* Tuile « Météo express » de la rubrique météo (rien sans prévision) */}
        <MiniMeteo />
      </div>
    </section>
  )
}
