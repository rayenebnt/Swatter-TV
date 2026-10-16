import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AdSlot } from '@/components/layout/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { Crumbs } from '@/components/video/Crumbs'
import { RelatedRail } from '@/components/video/RelatedRail'
import { VideoCard } from '@/components/video/VideoCard'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { fallbackVisual, renderNow, spokenDuration, toAbsolute, videoListUrl, videoLocation, videoObject } from '@/components/video/utils'
import { labelOf, VIDEO_CATEGORIES } from '@/lib/categories'
import { formatDate, formatNumber } from '@/lib/format'
import { mediaAlt, mediaSize, mediaUrl } from '@/lib/media'
import { getOtherVideos, getRelatedVideos, getVideoBySlug } from '@/lib/queries/videos'
import { SITE_NAME } from '@/lib/site'
import { videoUrl } from '@/lib/urls'
import { resolveVideo } from '@/lib/video'
import '@/styles/video.css'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache. */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const video = await getVideoBySlug(slug)
  if (!video) return { title: 'Vidéo introuvable', robots: { index: false } }

  const url = videoUrl(video)
  const description = (video.meta?.description || video.description || `Regardez «\u00a0${video.title}\u00a0» sur Swatter TV, la chaîne locale de la Haute-Savoie.`).slice(0, 200)
  const imageMedia = video.meta?.image && typeof video.meta.image === 'object' ? video.meta.image : video.thumbnail
  const image = mediaUrl(imageMedia, 'hero')
  const { width, height } = mediaSize(imageMedia, 'hero')
  const { contentUrl } = videoLocation(resolveVideo(video.source))
  const ogTitle = video.meta?.title || video.title

  return {
    // Le titre SEO saisi (ou généré) contient déjà « — Swatter TV »
    title: video.meta?.title ? { absolute: video.meta.title } : video.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'video.other',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url,
      title: ogTitle,
      description,
      images: [{ url: toAbsolute(image ?? fallbackVisual(video.id)), width, height, alt: mediaAlt(imageMedia, video.title) }],
      ...(contentUrl && /\.mp4(\?|$)/i.test(contentUrl) ? { videos: [{ url: contentUrl, type: 'video/mp4' }] } : {}),
    },
  }
}

export default async function VideoPage({ params }: { params: Params }) {
  const { slug } = await params
  const video = await getVideoBySlug(slug)
  if (!video) notFound()

  const resolved = resolveVideo(video.source)
  const label = labelOf(VIDEO_CATEGORIES, video.category) || 'Vidéos'
  const poster = mediaUrl(video.thumbnail, 'hero') ?? fallbackVisual(video.id)
  let related = await getRelatedVideos(video, 12)
  const sameCategory = related.length > 0
  if (!sameCategory) related = await getOtherVideos(video.id, 12)
  const now = renderNow()

  return (
    <>
      <div className="watch">
        <div className="container">
          <Crumbs items={[{ label: 'Vidéos', href: '/videos' }, { label, href: videoListUrl(video.category) }, { label: video.title }]} />
          <article className="watch__grid" aria-labelledby="watch-title">
            <VideoPlayer video={resolved} poster={poster} title={video.title} />
            <div className="watch__info">
              <p className="kicker">
                <Link href={videoListUrl(video.category)}>{label}</Link>
              </p>
              <h1 id="watch-title" className="watch__title">
                {video.title}
              </h1>
              <ul className="watch__meta">
                <li>
                  <Icon name="cal" />
                  <span className="sr-only">Publiée le </span>
                  <time dateTime={video.publishedAt}>{formatDate(video.publishedAt)}</time>
                </li>
                {video.duration && (
                  <li>
                    <Icon name="clock" />
                    <span className="sr-only">Durée&nbsp;: {spokenDuration(video.duration)}</span>
                    <span aria-hidden="true">{video.duration}</span>
                  </li>
                )}
                {video.views ? (
                  <li>
                    <Icon name="play" />
                    {formatNumber(video.views)} vue{video.views > 1 ? 's' : ''}
                  </li>
                ) : null}
              </ul>
              {video.description && <p className="watch__desc">{video.description}</p>}
              <div className="watch__actions">
                <Link className="btn btn--ghost btn--sm" href="/videos">
                  Toutes les vidéos
                  <Icon name="arrow" />
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      {related.length > 0 && (
        <RelatedRail
          id="rail-related"
          eyebrow={sameCategory ? label : 'À voir aussi'}
          title={sameCategory ? 'Dans la même catégorie' : 'D’autres vidéos'}
          more={sameCategory ? { href: videoListUrl(video.category), label: 'Tout voir' } : { href: '/videos', label: 'Toutes les vidéos' }}
        >
          {related.map((v) => (
            <VideoCard key={v.id} video={v} now={now} />
          ))}
        </RelatedRail>
      )}

      <JsonLd
        data={videoObject({
          name: video.title,
          description: video.description,
          thumbnail: mediaUrl(video.thumbnail, 'card') ?? fallbackVisual(video.id),
          uploadDate: video.publishedAt,
          duration: video.duration,
          url: videoUrl(video),
          video: resolved,
          views: video.views,
          extra: { genre: label },
        })}
      />
    </>
  )
}
