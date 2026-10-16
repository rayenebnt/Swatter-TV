import { VIDEO_CATEGORIES } from '@/lib/categories'
import { getLatestVideos } from '@/lib/queries/videos'
import { VideoCard } from './VideoCard'
import { VideoFilterRail } from './VideoFilterRail'
import { renderNow } from './utils'
import '@/styles/video.css'

/** Section « Vidéos du jour » : dernières vidéos, filtre par catégorie (seulement celles présentes). Masquée sans vidéo. */
export async function VideosSection() {
  const videos = await getLatestVideos(16)
  if (!videos.length) return null
  const now = renderNow()
  const options = VIDEO_CATEGORIES.filter((c) => videos.some((v) => v.category === c.value)).map((c) => ({ value: c.value, label: c.label }))
  return (
    <section className="section container" aria-labelledby="videos-title">
      <VideoFilterRail
        railId="rail-videos"
        eyebrow="À voir maintenant"
        title="Vidéos du jour"
        titleId="videos-title"
        options={options}
        items={videos.map((v) => ({ key: String(v.id), category: v.category, card: <VideoCard video={v} now={now} /> }))}
      />
    </section>
  )
}
