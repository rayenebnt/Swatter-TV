import type { Metadata } from 'next'
import Link from 'next/link'
import { AdSlot } from '@/components/layout/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { JsonLd } from '@/components/ui/JsonLd'
import { MediaImage } from '@/components/ui/MediaImage'
import { PageHeader } from '@/components/ui/PageHeader'
import { OnAirPanel } from '@/components/video/OnAirPanel'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { renderNow, toAbsolute, videoObject } from '@/components/video/utils'
import { formatDayLong, formatTime, parisDay } from '@/lib/format'
import { mediaUrl, type MediaRef } from '@/lib/media'
import { getOnAir, type Slot } from '@/lib/queries/schedule'
import { getSettings } from '@/lib/queries/settings'
import { SITE_NAME } from '@/lib/site'
import { resolveVideo } from '@/lib/video'
import '@/styles/video.css'

export const revalidate = 60

const DESCRIPTION = 'Regardez Swatter TV en direct et gratuitement : l’info, la météo, les magazines et les documentaires de la Haute-Savoie et d’Auvergne-Rhône-Alpes.'
const FALLBACK_POSTER = '/visuels/hero-crepuscule.webp'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  const poster = mediaUrl(settings?.livePoster, 'hero')
  return {
    title: 'Le direct',
    description: DESCRIPTION,
    alternates: { canonical: '/direct' },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url: '/direct',
      title: 'Swatter TV en direct',
      description: DESCRIPTION,
      images: [{ url: toAbsolute(poster ?? FALLBACK_POSTER) }],
    },
  }
}

/** « aujourd'hui », « demain » ou « samedi 17 octobre » (heure de Paris). */
function dayLabel(iso: string, now: number) {
  const day = parisDay(iso)
  if (day === parisDay(new Date(now))) return 'aujourd’hui'
  if (day === parisDay(new Date(now + 24 * 60 * 60 * 1000))) return 'demain'
  return `le ${formatDayLong(iso)}`
}

/** Direct coupé ou flux absent : message d'attente et prochaine émission. */
function LiveOff({ poster, next, now }: { poster: MediaRef; next: Slot | null; now: number }) {
  return (
    <div className="vp vp--off direct-off">
      <MediaImage media={poster} size="hero" fill sizes="(max-width: 1100px) 100vw, 900px" alt="" className="vp__poster" fallbackSrc={FALLBACK_POSTER} priority />
      <div className="vp__overlay">
        <Icon name="tv" className="vp__off-ico" />
        <h2>Le direct reprend bientôt</h2>
        {next ? (
          <p>
            Prochaine émission : <b>{next.title}</b>, {dayLabel(next.start, now)} à <time dateTime={next.start}>{formatTime(next.start)}</time>.
          </p>
        ) : (
          <p>En attendant, retrouvez nos émissions en replay et nos dernières vidéos.</p>
        )}
        <Link className="btn btn--gold btn--sm" href={next ? '/programme-tv' : '/replay'}>
          <Icon name={next ? 'cal' : 'replay'} />
          {next ? 'Voir le programme TV' : 'Voir le replay'}
        </Link>
      </div>
    </div>
  )
}

export default async function DirectPage() {
  const now = renderNow()
  const [settings, onAir] = await Promise.all([getSettings(), getOnAir(new Date(now), 6)])
  const live = settings?.liveEnabled ? resolveVideo(settings.live) : null
  const poster = mediaUrl(settings?.livePoster, 'hero') ?? (live?.kind === 'youtube' ? live.thumbnail : null) ?? FALLBACK_POSTER
  const current = onAir.current

  return (
    <>
      <PageHeader eyebrow="Swatter TV · 24 h/24" title="Le direct" description={DESCRIPTION} crumbs={[{ label: 'Le direct' }]} />

      <section className="container direct" aria-label="Le direct de Swatter TV">
        <div className="direct__grid">
          {live ? (
            <VideoPlayer video={live} poster={poster} title={current ? `Swatter TV en direct : ${current.title}` : 'Swatter TV en direct'} live />
          ) : (
            <LiveOff poster={settings?.livePoster} next={onAir.next[0] ?? null} now={now} />
          )}
          <OnAirPanel current={current} next={onAir.next} />
        </div>
      </section>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      {live && (
        <JsonLd
          data={videoObject({
            name: current ? `${current.title} — Swatter TV en direct` : 'Swatter TV en direct',
            description: current?.synopsis || DESCRIPTION,
            thumbnail: poster,
            uploadDate: current?.start ?? settings?.updatedAt ?? new Date(now).toISOString(),
            url: '/direct',
            video: live,
            extra: current
              ? { publication: { '@type': 'BroadcastEvent', name: current.title, isLiveBroadcast: true, startDate: current.start, endDate: current.end } }
              : undefined,
          })}
        />
      )}
    </>
  )
}
