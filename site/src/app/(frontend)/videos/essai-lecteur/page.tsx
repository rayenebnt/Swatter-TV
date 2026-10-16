// TEMPORAIRE (tests du lecteur, à supprimer)
import { LiveOff } from '@/components/video/LiveOff'
import { OnAirPanel } from '@/components/video/OnAirPanel'
import { Pager } from '@/components/video/Pager'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { renderNow } from '@/components/video/utils'
import type { Slot } from '@/lib/queries/schedule'
import { resolveVideo } from '@/lib/video'

export const metadata = { robots: { index: false } }
export const dynamic = 'force-dynamic'

const slot = (id: number, title: string, startMin: number, dur: number, now: number): Slot => ({
  id,
  title,
  start: new Date(now + startMin * 60_000).toISOString(),
  end: new Date(now + (startMin + dur) * 60_000).toISOString(),
  durationMinutes: dur,
  genre: 'info',
  genreLabel: 'Info',
  synopsis: 'Synopsis de test.',
  image: null,
  programSlug: null,
  isPremiere: false,
})

export default function Essai() {
  const now = renderNow()
  const yt = resolveVideo({ provider: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  return (
    <div className="container" style={{ paddingTop: 120, display: 'grid', gap: 40 }}>
      <div id="p-mp4"><VideoPlayer video={{ kind: 'mp4', src: 'http://localhost:3000/api/media/file/matin-alpages.mp4' }} poster="http://localhost:3000/api/media/file/hero-crepuscule.webp" title="Essai MP4" /></div>
      <div id="p-hls"><VideoPlayer video={{ kind: 'hls', src: 'https://cdn.essai.test/hls/live.m3u8' }} poster="/visuels/hero-nuit.webp" title="Essai HLS" live /></div>
      <div id="p-yt"><VideoPlayer video={yt} title="Essai YouTube" /></div>
      <div id="p-bunny"><VideoPlayer video={{ kind: 'iframe', embedUrl: 'https://iframe.mediadelivery.net/embed/1/abc?autoplay=true' }} poster="/visuels/t-hiver-a.webp" title="Essai Bunny" /></div>
      <div id="p-none"><VideoPlayer video={null} title="Essai vide" /></div>
      <div id="p-bad"><VideoPlayer video={{ kind: 'mp4', src: 'http://localhost:3000/api/media/file/inexistant.mp4' }} title="Essai erreur" /></div>
      <div id="p-off" className="direct"><LiveOff poster={null} next={slot(9, 'Le journal des Alpes', 26 * 60, 20, now)} now={now} fallbackSrc="/visuels/hero-crepuscule.webp" /></div>
      <div id="p-off2" className="direct"><LiveOff poster={null} next={null} now={now} fallbackSrc="/visuels/hero-crepuscule.webp" /></div>
      <div id="p-pager2"><Pager page={2} totalPages={3} hrefFor={(n) => `/videos?page=${n}`} label="Pages" /></div>
      <div id="p-pager1"><Pager page={1} totalPages={3} hrefFor={(n) => `/videos?page=${n}`} label="Pages" /></div>
      <div id="p-air-empty"><OnAirPanel current={null} next={[]} /></div>
      <div id="p-air-stale"><OnAirPanel current={slot(1, 'Déjà fini', -30, 29, now)} next={[slot(2, 'En cours (client)', -1, 90, now), slot(3, 'Ensuite', 89, 30, now)]} /></div>
    </div>
  )
}
