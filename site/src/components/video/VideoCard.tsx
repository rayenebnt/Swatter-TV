import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { labelOf, VIDEO_CATEGORIES } from '@/lib/categories'
import { formatDate, timeAgo } from '@/lib/format'
import type { VideoListItem } from '@/lib/queries/videos'
import { videoUrl } from '@/lib/urls'
import { fallbackVisual, spokenDuration } from './utils'
import '@/styles/video.css'

/** Moins de 24 h : badge « Nouveau ». */
const NEW_MS = 24 * 60 * 60 * 1000

/** Largeurs d'affichage des vignettes : rails (78 % de l'écran sur mobile) et grilles (2 colonnes sur mobile). */
export const CARD_SIZES = '(max-width: 760px) 78vw, (max-width: 1100px) 31vw, 330px'
export const GRID_SIZES = '(max-width: 760px) 46vw, (max-width: 1100px) 31vw, 330px'

/**
 * Carte vidéo (maquette : .card.vcard). Composant serveur : badge et date relative calculés au rendu.
 * `meta` : date de publication sous le titre (grilles) ; sinon description au survol (rails).
 */
export function VideoCard({
  video,
  now,
  meta = false,
  sizes = CARD_SIZES,
}: {
  video: VideoListItem
  now: number
  meta?: boolean
  sizes?: string
}) {
  const isNew = now - new Date(video.publishedAt).getTime() < NEW_MS
  return (
    <article className="card vcard" data-cat={video.category}>
      <div className="media">
        <MediaImage media={video.thumbnail} size="card" fill sizes={sizes} alt="" fallbackSrc={fallbackVisual(video.id)} />
        {isNew && <span className="badge badge--new">Nouveau</span>}
        {video.duration && (
          <span className="dur">
            <span className="sr-only">Durée&nbsp;: {spokenDuration(video.duration)}</span>
            <span aria-hidden="true">{video.duration}</span>
          </span>
        )}
        <span className="play" aria-hidden="true">
          <Icon name="play" />
        </span>
      </div>
      <div className="card__body">
        <p className="kicker">{labelOf(VIDEO_CATEGORIES, video.category) || 'Vidéo'}</p>
        <h3 className="card__title">
          <Link className="stretched" href={videoUrl(video)}>
            {video.title}
          </Link>
        </h3>
        {meta ? (
          <div className="card__meta">
            <span>
              <Icon name="clock" />
              <time dateTime={video.publishedAt} title={formatDate(video.publishedAt)}>
                {timeAgo(video.publishedAt, new Date(now))}
              </time>
            </span>
          </div>
        ) : (
          video.description && <p className="card__desc">{video.description}</p>
        )}
      </div>
    </article>
  )
}
