import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { Rail, RailArrows } from '@/components/ui/Rail'
import { SectionHead } from '@/components/ui/SectionHead'
import { getLatestReplays } from '@/lib/queries/replays'
import { ReplayCard } from './ReplayCard'
import { renderNow } from './utils'
import '@/styles/video.css'

/** Section « Le Replay » : derniers replays diffusés, lien vers la page Replay. Masquée sans replay. */
export async function ReplaySection() {
  const replays = await getLatestReplays(12)
  if (!replays.length) return null
  const now = renderNow()
  return (
    <section className="section container" id="replay" aria-labelledby="replay-title">
      <SectionHead eyebrow="Voir ou revoir" title="Le Replay" titleId="replay-title">
        <Link className="link-more" href="/replay">
          Tous les replays <Icon name="arrow" />
        </Link>
        <RailArrows target="rail-replay" />
      </SectionHead>
      <div data-reveal>
        <Rail id="rail-replay" className="rail-replay" label="Le Replay">
          {replays.map((r) => (
            <ReplayCard key={r.id} replay={r} now={now} />
          ))}
        </Rail>
      </div>
    </section>
  )
}
