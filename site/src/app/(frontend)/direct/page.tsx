import type { Metadata } from 'next'
import { AdSlot } from '@/components/layout/AdSlot'
import { JsonLd } from '@/components/ui/JsonLd'
import { MediaImage } from '@/components/ui/MediaImage'
import { PageHeader } from '@/components/ui/PageHeader'
import { DirectStage } from '@/components/video/DirectStage'
import { OnAirPanel } from '@/components/video/OnAirPanel'
import { ReplaySection } from '@/components/video/ReplaySection'
import { renderNow, videoObject } from '@/components/video/utils'
import { BROADCAST_HOURS_LABEL } from '@/lib/broadcast'
import { mediaFocal, mediaUrl, wholeOrientation } from '@/lib/media'
import { onAirState } from '@/lib/on-air'
import { getOnAirData } from '@/lib/queries/schedule'
import { getSettings } from '@/lib/queries/settings'
import { SITE_NAME } from '@/lib/site'
import { resolveVideo } from '@/lib/video'
import '@/styles/video.css'
import { ogImage } from '@/lib/og'

export const revalidate = 60

const DESCRIPTION =
  'Regardez Swatter TV Info en direct et gratuitement, tous les soirs de 18 h à 0 h 30 : l’info, la météo, les magazines et les documentaires d’Auvergne-Rhône-Alpes.'
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
  const now = new Date(renderNow())
  const [settings, onAir] = await Promise.all([getSettings(), getOnAirData(now)])
  const live = settings?.liveEnabled ? resolveVideo(settings.live) : null
  const poster = mediaUrl(settings?.livePoster, 'hero') ?? (live?.kind === 'youtube' ? live.thumbnail : null) ?? FALLBACK_POSTER
  // Programme en cours au rendu, pour les données structurées seulement : le lecteur ou l'écran hors antenne, et
  // « En ce moment / À suivre », se décident aussi dans le navigateur (page en cache, onglet resté ouvert)
  const { current } = onAirState(onAir.slots, now.getTime())

  return (
    <>
      <PageHeader eyebrow={`Swatter TV Info · tous les soirs, ${BROADCAST_HOURS_LABEL}`} title="Le direct" description={DESCRIPTION} crumbs={[{ label: 'Le direct' }]} />

      <section className="container direct" aria-label="Le direct de Swatter TV Info">
        <div className="direct__grid" data-preview="live">
          <DirectStage
            data={onAir}
            player={
              live
                ? { video: live, poster, posterPosition: mediaFocal(settings?.livePoster), posterOrientation: wholeOrientation(settings?.livePoster, 16 / 9, 'hero') }
                : null
            }
            poster={
              <MediaImage
                media={settings?.livePoster}
                size="hero"
                fill
                whole
                sizes="(max-width: 1100px) 100vw, 900px"
                alt=""
                className="vp__poster"
                fallbackSrc={FALLBACK_POSTER}
                priority
              />
            }
          />
          <OnAirPanel data={onAir} />
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
            uploadDate: current?.start ?? settings?.updatedAt ?? now.toISOString(),
            url: '/direct',
            video: live,
            // la soirée d'antenne en cours ou à venir (18 h – 0 h 30), qu'un programme soit saisi ou non
            extra: {
              publication: {
                '@type': 'BroadcastEvent',
                name: current?.title ?? 'Swatter TV Info en direct',
                isLiveBroadcast: true,
                startDate: onAir.evening.start,
                endDate: onAir.evening.end,
              },
            },
          })}
        />
      )}
    </>
  )
}
