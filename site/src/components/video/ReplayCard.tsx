import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { labelOf, PROGRAM_GENRES } from '@/lib/categories'
import { formatDayLong, formatTime, timeAgo } from '@/lib/format'
import { programOf, type ReplayListItem } from '@/lib/queries/replays'
import { replayUrl } from '@/lib/urls'
import { CARD_SIZES } from './VideoCard'
import { fallbackVisual, spokenDuration } from './utils'
import '@/styles/video.css'

/** Carte replay (maquette : .card.vcard du rail « Le Replay ») : genre de l'émission, titre, date de diffusion. */
export function ReplayCard({
  replay,
  now,
  sizes = CARD_SIZES,
}: {
  replay: ReplayListItem
  now: number
  sizes?: string
}) {
  const program = programOf(replay)
  const kicker = (program?.genre && labelOf(PROGRAM_GENRES, program.genre)) || program?.title || 'Replay'
  return (
    <article className="card vcard">
      <div className="media">
        <MediaImage media={replay.thumbnail} size="card" fill sizes={sizes} alt="" fallbackSrc={fallbackVisual(replay.id)} />
        {replay.duration && (
          <span className="dur">
            <span className="sr-only">Durée&nbsp;: {spokenDuration(replay.duration)}</span>
            <span aria-hidden="true">{replay.duration}</span>
          </span>
        )}
        <span className="play" aria-hidden="true">
          <Icon name="play" />
        </span>
      </div>
      <div className="card__body">
        <p className="kicker">{kicker}</p>
        <h3 className="card__title">
          <Link className="stretched" href={replayUrl(replay)}>
            {replay.title}
          </Link>
        </h3>
        <div className="card__meta">
          <span>
            <Icon name="clock" />
            <span className="sr-only">Diffusé </span>
            <time dateTime={replay.broadcastAt} title={`Diffusé le ${formatDayLong(replay.broadcastAt)} à ${formatTime(replay.broadcastAt)}`}>
              {timeAgo(replay.broadcastAt, new Date(now))}
            </time>
          </span>
        </div>
      </div>
    </article>
  )
}
