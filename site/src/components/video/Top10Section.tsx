import Link from 'next/link'
import { MediaImage } from '@/components/ui/MediaImage'
import { Rail, RailArrows } from '@/components/ui/Rail'
import { SectionHead } from '@/components/ui/SectionHead'
import { labelOf, VIDEO_CATEGORIES } from '@/lib/categories'
import { getTop10 } from '@/lib/queries/videos'
import { videoUrl } from '@/lib/urls'
import { fallbackVisual } from './utils'
import '@/styles/video.css'

/**
 * Section « Le Top 10 Swatter » : rail de vignettes portrait avec grands chiffres dorés. Masquée sans vidéo.
 * `priority` : première vignette chargée en priorité (section visible dès l'arrivée sur la page).
 */
export async function Top10Section({ priority = false }: { priority?: boolean } = {}) {
  const videos = await getTop10()
  if (!videos.length) return null
  return (
    <section className="section container" aria-labelledby="top-title">
      <SectionHead eyebrow="Cette semaine" title="Le Top 10 Swatter" titleId="top-title">
        <RailArrows target="rail-top" />
      </SectionHead>
      <div data-reveal>
        <Rail id="rail-top" className="rail-top" label="Le Top 10 Swatter">
          {videos.map((v, i) => (
            <Link key={v.id} className="top" href={videoUrl(v)} aria-label={`${i + 1}. ${v.title}`}>
              <span className="top__n" aria-hidden="true">
                {i + 1}
              </span>
              <div className="top__card">
                <MediaImage media={v.thumbnail} size="poster" fill sizes="(max-width: 760px) 150px, 176px" alt="" fallbackSrc={fallbackVisual(v.id)} priority={priority && i === 0} />
                <div className="top__info">
                  <small>{labelOf(VIDEO_CATEGORIES, v.category)}</small>
                  <strong>{v.title}</strong>
                </div>
              </div>
            </Link>
          ))}
        </Rail>
      </div>
    </section>
  )
}
