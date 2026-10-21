import Link from 'next/link'
import { recentFavorites, recentHistory } from '@/components/members/space/data'
import { MeteoBlock, NewsBlock, OutingsBlock } from '@/components/members/space/DepartmentBlocks'
import { requireMember, spaceMetadata } from '@/components/members/space/guard'
import { SPACE_GRID4_SIZES, SpaceCard } from '@/components/members/space/ItemCard'
import { SpaceBlock, SpaceEmpty } from '@/components/members/space/SpaceBlock'
import { Icon } from '@/components/ui/Icon'

export const dynamic = 'force-dynamic'

export const metadata = spaceMetadata('Mon espace')

/**
 * Tableau de bord de « Mon espace » : reprendre une vidéo, derniers contenus gardés, puis la météo, l'info et les sorties
 * du département choisi (ou une invitation à en choisir un).
 */
export default async function SpaceDashboardPage() {
  const member = await requireMember('/compte')
  const [history, favorites] = await Promise.all([recentHistory(member, 4), recentFavorites(member, 4)])
  const dept = member.department ?? null

  return (
    <div className="container section--tight space-page space-dashboard">
      <SpaceBlock
        id="reprendre"
        title="Reprendre"
        subtitle={member.historyPaused ? 'Historique en pause' : history.entries.length ? 'Les dernières vidéos et replays regardés' : undefined}
        more={history.entries.length ? { href: '/compte/historique', sr: 'l’historique' } : undefined}
      >
        {history.entries.length ? (
          <ul className="space-grid space-grid--4">
            {history.entries.map((e) => (
              <li key={e.key}>
                <SpaceCard entry={e} sizes={SPACE_GRID4_SIZES} />
              </li>
            ))}
          </ul>
        ) : (
          <SpaceEmpty icon="play" title={member.historyPaused ? 'Votre historique est en pause' : 'Aucune vidéo regardée pour l’instant'}>
            {member.historyPaused ? (
              <>
                Les vidéos que vous regardez ne sont pas enregistrées. Vous pouvez le réactiver depuis <Link href="/compte/historique">votre historique</Link>.
              </>
            ) : (
              <>
                Les vidéos et replays que vous lancez en étant connecté s’afficheront ici, pour les reprendre plus tard. Découvrez{' '}
                <Link href="/videos">les vidéos</Link> ou <Link href="/replay">les replays</Link>.
              </>
            )}
          </SpaceEmpty>
        )}
      </SpaceBlock>

      <SpaceBlock
        id="ma-liste"
        title="Ma liste"
        subtitle={favorites.entries.length ? 'Les derniers contenus gardés pour plus tard' : undefined}
        more={favorites.entries.length ? { href: '/compte/ma-liste', sr: 'ma liste' } : undefined}
      >
        {favorites.entries.length ? (
          <ul className="space-grid space-grid--4">
            {favorites.entries.map((e) => (
              <li key={e.key}>
                <SpaceCard entry={e} sizes={SPACE_GRID4_SIZES} />
              </li>
            ))}
          </ul>
        ) : (
          <SpaceEmpty icon="bookmark" title="Votre liste est vide">
            Sur une vidéo, un replay, un article ou un événement, appuyez sur «&nbsp;Ajouter à ma liste&nbsp;» pour le garder ici et y revenir quand
            vous voulez.
          </SpaceEmpty>
        )}
      </SpaceBlock>

      {dept ? (
        <div className="space-local">
          <MeteoBlock dept={dept} />
          <NewsBlock dept={dept} />
          <OutingsBlock dept={dept} />
        </div>
      ) : (
        <section className="space-invite" aria-labelledby="choisir-departement">
          <span className="space-invite__icon" aria-hidden="true">
            <Icon name="pin" />
          </span>
          <div>
            <h2 id="choisir-departement">Votre département, en un coup d’œil</h2>
            <p>Choisissez votre département&nbsp;: sa météo, ses dernières infos et les prochaines sorties près de chez vous s’afficheront ici.</p>
          </div>
          <Link className="btn btn--gold btn--sm" href="/compte/profil#mes-informations">
            Choisir mon département
          </Link>
        </section>
      )}
    </div>
  )
}
