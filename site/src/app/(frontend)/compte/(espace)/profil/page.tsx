import { AccountData } from '@/components/members/space/AccountData'
import { requireMember, spaceMetadata } from '@/components/members/space/guard'
import { PasswordForm } from '@/components/members/space/PasswordForm'
import { ProfileForm } from '@/components/members/space/ProfileForm'
import { SectionHead } from '@/components/ui/SectionHead'
import { formatDate } from '@/lib/format'
import { toProfile } from '@/lib/members/session'

export const dynamic = 'force-dynamic'

export const metadata = spaceMetadata('Mon profil')

const countOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Profil du membre : ses informations, son mot de passe et ses données (téléchargement, déconnexion, suppression). */
export default async function SpaceProfilePage() {
  const member = await requireMember('/compte/profil')
  const profile = toProfile(member)
  const since = formatDate(member.createdAt).replace(/^1 /, '1er ')
  return (
    <div className="container section--tight space-page">
      <SectionHead title="Mon profil" subtitle="Vos informations, votre mot de passe et vos données personnelles." />
      <div className="space-panels">
        <section className="space-panel" id="mes-informations" aria-labelledby="mes-informations-titre">
          <h3 id="mes-informations-titre">Mes informations</h3>
          <ProfileForm profile={profile} since={since} />
        </section>
        <section className="space-panel" aria-labelledby="mot-de-passe-titre">
          <h3 id="mot-de-passe-titre">Mot de passe</h3>
          <PasswordForm email={profile.email} />
        </section>
        <section className="space-panel space-panel--wide" aria-labelledby="mes-donnees-titre">
          <h3 id="mes-donnees-titre">Mes données</h3>
          <AccountData historyCount={countOf(member.historyCount)} favoritesCount={countOf(member.favoritesCount)} />
        </section>
      </div>
    </div>
  )
}
