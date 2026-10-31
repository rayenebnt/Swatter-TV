import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AdSlot } from '@/components/layout/AdSlot'
import { SaveButton } from '@/components/members/SaveButton'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { Crumbs } from '@/components/video/Crumbs'
import { RelatedRail } from '@/components/video/RelatedRail'
import { ReplayCard } from '@/components/video/ReplayCard'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { fallbackVisual, renderNow, replayListUrl, spokenDuration, videoLocation, videoObject } from '@/components/video/utils'
import { labelOf, PROGRAM_GENRES } from '@/lib/categories'
import { formatDate, formatTime } from '@/lib/format'
import { mediaAlt, mediaFocal, mediaUrl, wholeOrientation } from '@/lib/media'
import { getOtherEpisodes, getOtherReplays, getReplayBySlug, programOf } from '@/lib/queries/replays'
import { SITE_NAME } from '@/lib/site'
import { replayUrl } from '@/lib/urls'
import { previewUrl, resolveVideo } from '@/lib/video'
import '@/styles/video.css'
import { ogImage } from '@/lib/og'

export const revalidate = 60
export const dynamicParams = true

/** Pages générées à la première visite puis mises en cache. */
export function generateStaticParams() {
  return []
}

type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const replay = await getReplayBySlug(slug)
  if (!replay) return { title: 'Replay introuvable', robots: { index: false } }

  const program = programOf(replay)
  const url = replayUrl(replay)
  const description = (
    replay.meta?.description ||
    replay.description ||
    program?.synopsis ||
    `Revoir «\u00a0${replay.title}\u00a0», diffusé le ${formatDate(replay.broadcastAt)} sur Swatter TV Info.`
  ).slice(0, 200)
  const imageMedia = replay.meta?.image && typeof replay.meta.image === 'object' ? replay.meta.image : replay.thumbnail
  const { contentUrl } = videoLocation(resolveVideo(replay.source))
  const ogTitle = replay.meta?.title || `${replay.title} en replay`

  return {
    // Le titre SEO saisi (ou généré) contient déjà « — Swatter TV »
    title: replay.meta?.title ? { absolute: replay.meta.title } : `${replay.title} en replay`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'video.episode',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url,
      title: ogTitle,
      description,
      images: [ogImage(imageMedia, fallbackVisual(replay.id), mediaAlt(imageMedia, replay.title))],
      ...(contentUrl && /\.mp4(\?|$)/i.test(contentUrl) ? { videos: [{ url: contentUrl, type: 'video/mp4' }] } : {}),
    },
  }
}

export default async function ReplayEpisodePage({ params }: { params: Params }) {
  const { slug } = await params
  const replay = await getReplayBySlug(slug)
  if (!replay) notFound()

  const program = programOf(replay)
  const resolved = resolveVideo(replay.source)
  const poster = mediaUrl(replay.thumbnail, 'hero') ?? fallbackVisual(replay.id)
  const genre = program?.genre ? labelOf(PROGRAM_GENRES, program.genre) : ''
  let others = await getOtherEpisodes(replay, 12)
  const sameProgram = others.length > 0
  if (!sameProgram) others = await getOtherReplays(replay.id, 12)
  const now = renderNow()
  const description = replay.description || program?.synopsis

  return (
    <>
      <div className="watch">
        <div className="container">
          <Crumbs items={[{ label: 'Replay', href: '/replay' }, ...(program ? [{ label: program.title, href: replayListUrl(program.slug) }] : []), { label: replay.title }]} />
          <article className="watch__grid" aria-labelledby="watch-title">
            {/* history : replay ajouté à l'historique du membre connecté au lancement de la lecture ;
                preview : aperçu animé (chargé avec la fiche, depth 1) derrière le bouton de lecture */}
            <VideoPlayer
              video={resolved}
              poster={poster}
              posterPosition={mediaFocal(replay.thumbnail)}
              posterOrientation={wholeOrientation(replay.thumbnail, 16 / 9, 'hero')}
              preview={previewUrl(replay.preview)}
              title={replay.title}
              history={{ kind: 'replay', id: replay.id }}
            />
            <div className="watch__info">
              <p className="kicker">
                {program ? <Link href={replayListUrl(program.slug)}>{program.title}</Link> : 'Replay'}
                {genre && program?.title !== genre ? ` · ${genre}` : ''}
              </p>
              <h1 id="watch-title" className="watch__title">
                {replay.title}
              </h1>
              <ul className="watch__meta">
                <li>
                  <Icon name="cal" />
                  <time dateTime={replay.broadcastAt}>
                    Diffusé le {formatDate(replay.broadcastAt)} à {formatTime(replay.broadcastAt)}
                  </time>
                </li>
                {replay.duration && (
                  <li>
                    <Icon name="clock" />
                    <span className="sr-only">Durée&nbsp;: {spokenDuration(replay.duration)}</span>
                    <span aria-hidden="true">{replay.duration}</span>
                  </li>
                )}
              </ul>
              {description && <p className="watch__desc">{description}</p>}
              <div className="watch__actions">
                <SaveButton kind="replay" id={replay.id} title={replay.title} />
                <Link className="btn btn--ghost btn--sm" href={program ? replayListUrl(program.slug) : '/replay'}>
                  {program ? 'Tous les épisodes' : 'Tous les replays'}
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

      {others.length > 0 && (
        <RelatedRail
          id="rail-episodes"
          kind="replay"
          eyebrow={sameProgram && program ? program.title : 'Voir ou revoir'}
          title={sameProgram ? 'Autres épisodes' : 'Derniers replays'}
          more={sameProgram && program ? { href: replayListUrl(program.slug), label: 'Tout voir' } : { href: '/replay', label: 'Tous les replays' }}
        >
          {others.map((r) => (
            <ReplayCard key={r.id} replay={r} now={now} />
          ))}
        </RelatedRail>
      )}

      <JsonLd
        data={videoObject({
          name: replay.title,
          description,
          thumbnail: mediaUrl(replay.thumbnail, 'card') ?? fallbackVisual(replay.id),
          uploadDate: replay.broadcastAt,
          duration: replay.duration,
          url: replayUrl(replay),
          video: resolved,
          extra: program ? { isPartOf: { '@type': 'TVSeries', name: program.title }, ...(genre ? { genre } : {}) } : undefined,
        })}
      />
    </>
  )
}
