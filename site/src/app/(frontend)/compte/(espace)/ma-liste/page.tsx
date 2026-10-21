import { allFavorites } from '@/components/members/space/data'
import { FavoritesManager } from '@/components/members/space/FavoritesManager'
import { requireMember, spaceMetadata } from '@/components/members/space/guard'
import { SectionHead } from '@/components/ui/SectionHead'

export const dynamic = 'force-dynamic'

export const metadata = spaceMetadata('Ma liste')

/** « Ma liste » : vidéos, replays, articles et événements gardés par le membre (contenus encore en ligne seulement). */
export default async function SpaceListPage() {
  const member = await requireMember('/compte/ma-liste')
  const { entries } = await allFavorites(member)
  return (
    <div className="container section--tight space-page">
      <SectionHead title="Ma liste" subtitle="Les contenus que vous avez gardés pour plus tard, du plus récent au plus ancien." />
      <FavoritesManager entries={entries} />
    </div>
  )
}
