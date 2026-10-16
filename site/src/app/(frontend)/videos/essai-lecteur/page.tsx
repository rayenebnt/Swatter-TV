// TEMPORAIRE (tests du lecteur, à supprimer)
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { resolveVideo } from '@/lib/video'

export const metadata = { robots: { index: false } }

export default function Essai() {
  const yt = resolveVideo({ provider: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  return (
    <div className="container" style={{ paddingTop: 120, display: 'grid', gap: 40 }}>
      <div id="p-mp4"><VideoPlayer video={{ kind: 'mp4', src: 'http://localhost:3000/api/media/file/matin-alpages.mp4' }} poster="http://localhost:3000/api/media/file/hero-crepuscule.webp" title="Essai MP4" /></div>
      <div id="p-hls"><VideoPlayer video={{ kind: 'hls', src: 'https://cdn.essai.test/hls/live.m3u8' }} poster="/visuels/hero-nuit.webp" title="Essai HLS" live /></div>
      <div id="p-yt"><VideoPlayer video={yt} title="Essai YouTube" /></div>
      <div id="p-bunny"><VideoPlayer video={{ kind: 'iframe', embedUrl: 'https://iframe.mediadelivery.net/embed/1/abc?autoplay=true' }} poster="/visuels/t-hiver-a.webp" title="Essai Bunny" /></div>
      <div id="p-none"><VideoPlayer video={null} title="Essai vide" /></div>
      <div id="p-bad"><VideoPlayer video={{ kind: 'mp4', src: 'http://localhost:3000/api/media/file/inexistant.mp4' }} title="Essai erreur" /></div>
    </div>
  )
}
