import Link from 'next/link'
import { MediaImage } from '@/components/ui/MediaImage'
import { Rail, RailArrows } from '@/components/ui/Rail'
import { SectionHead } from '@/components/ui/SectionHead'
import { labelOf, VIDEO_CATEGORIES } from '@/lib/categories'
import { getTop10 } from '@/lib/queries/videos'
import { videoUrl } from '@/lib/urls'
import { previewUrl } from '@/lib/video'
import { fallbackVisual } from './utils'
import { VideoPreview } from './VideoPreview'
import '@/styles/video.css'

/**
 * Section « Top 10 » : rail de vignettes portrait avec grands chiffres dorés. Masquée sans vidéo.
 * `priority` : première vignette chargée en priorité (section visible dès l'arrivée sur la page).
 */
export async function Top10Section({ priority = false }: { priority?: boolean } = {}) {
  const videos = await getTop10()
  if (!videos.length) return null
  return (
    <section className="section container" aria-labelledby="top-title">
      <SectionHead eyebrow="Cette semaine" title="Top 10" titleId="top-title">
        <RailArrows target="rail-top" />
      </SectionHead>
      <div data-reveal>
        <Rail id="rail-top" className="rail-top" label="Top 10">
          {videos.map((v, i) => {
            const preview = previewUrl(v.preview)
            return (
              <Link key={v.id} className="top" href={videoUrl(v)} aria-label={`${i + 1}. ${v.title}`}>
                <span className="top__n" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="top__card">
                  {/* vignette portrait : image en largeur entière sur fond flou (une image en hauteur la couvre) */}
                  <MediaImage media={v.thumbnail} size="hero" fill whole sizes="(max-width: 760px) 150px, 176px" alt="" fallbackSrc={fallbackVisual(v.id)} priority={priority && i === 0} />
                  {/* aperçu 16:9 entier, au même endroit que l'image (video.css) */}
                  {preview && <VideoPreview src={preview} />}
                  <div className="top__info">
                    <small>{labelOf(VIDEO_CATEGORIES, v.category)}</small>
                    <strong>{v.title}</strong>
                  </div>
                </div>
              </Link>
            )
          })}
        </Rail>
      </div>
    </section>
  )
}
