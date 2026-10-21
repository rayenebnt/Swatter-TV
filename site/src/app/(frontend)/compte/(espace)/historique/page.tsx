import { historyByDay } from '@/components/members/space/data'
import { requireMember, spaceMetadata } from '@/components/members/space/guard'
import { HistoryManager } from '@/components/members/space/HistoryManager'
import { SectionHead } from '@/components/ui/SectionHead'

export const dynamic = 'force-dynamic'

export const metadata = spaceMetadata('Mon historique')

/** Historique du membre : vidéos et replays regardés, jour par jour (200 au plus), contenus encore en ligne seulement. */
export default async function SpaceHistoryPage() {
  const member = await requireMember('/compte/historique')
  const { groups } = await historyByDay(member)
  return (
    <div className="container section--tight space-page">
      <SectionHead title="Historique" subtitle="Les vidéos et replays que vous avez regardés, du plus récent au plus ancien." />
      <HistoryManager groups={groups} paused={Boolean(member.historyPaused)} />
    </div>
  )
}
