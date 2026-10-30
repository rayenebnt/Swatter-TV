import type { Metadata } from 'next'
import { AdSlot } from '@/components/layout/AdSlot'
import { JsonLd } from '@/components/ui/JsonLd'
import { PageHeader } from '@/components/ui/PageHeader'
import { LiveOff } from '@/components/video/LiveOff'
import { OnAirPanel } from '@/components/video/OnAirPanel'
import { ReplaySection } from '@/components/video/ReplaySection'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { renderNow, videoObject } from '@/components/video/utils'
import { mediaFocal, mediaUrl } from '@/lib/media'
import { getOnAir } from '@/lib/queries/schedule'
import { getSettings } from '@/lib/queries/settings'
import { SITE_NAME } from '@/lib/site'
import { resolveVideo } from '@/lib/video'
import '@/styles/video.css'
import { ogImage } from '@/lib/og'

export const revalidate = 60

const DESCRIPTION = 'Regardez Swatter TV Info en direct et gratuitement\u00a0: l’info, la météo, les magazines et les documentaires d’Auvergne-Rhône-Alpes.'
const FALLBACK_POSTER = '/visuels/hero-crepuscule.webp'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  return {
    title: 'Le direct',
    description: DESCRIPTION,
    alternates: { canonical: '/direct' },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url: '/direct',
      title: 'Swatter TV Info en direct',
      description: DESCRIPTION,
      images: [ogImage(settings?.livePoster, FALLBACK_POSTER, 'Swatter TV Info en direct')],
    },
  }
}

export default async function DirectPage() {
  const now = renderNow()
  const [settings, onAir] = await Promise.all([getSettings(), getOnAir(new Date(now), 6)])
  const live = settings?.liveEnabled ? resolveVideo(settings.live) : null
  const poster = mediaUrl(settings?.livePoster, 'hero') ?? (live?.kind === 'youtube' ? live.thumbnail : null) ?? FALLBACK_POSTER
  const current = onAir.current

  return (
    <>
      <PageHeader eyebrow="Swatter TV Info · 24 h/24" title="Le direct" description={DESCRIPTION} crumbs={[{ label: 'Le direct' }]} />

      <section className="container direct" aria-label="Le direct de Swatter TV Info">
        <div className="direct__grid" data-preview="live">
          {live ? (
            // autoPlay : le direct d\u00e9marre seul, sans le son, quand il est visible (lecteurs tiers : contenus externes accept\u00e9s)
            <VideoPlayer
              video={live}
              poster={poster}
              posterPosition={mediaFocal(settings?.livePoster)}
              title={current ? `Swatter TV Info en direct\u00a0: ${current.title}` : 'Swatter TV Info en direct'}
              live
              autoPlay
            />
          ) : (
            <LiveOff poster={settings?.livePoster} next={onAir.next[0] ?? null} now={now} fallbackSrc={FALLBACK_POSTER} />
          )}
          <OnAirPanel current={current} next={onAir.next} />
        </div>
      </section>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      <ReplaySection />

      {live && (
        <JsonLd
          data={videoObject({
            name: current ? `${current.title} — Swatter TV Info en direct` : 'Swatter TV Info en direct',
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
