import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell, AuthSwitch, authReturn, withReturn } from '@/components/members/auth/AuthShell'
import { SignupClosed, SignupForm } from '@/components/members/auth/SignupForm'
import { Icon, type IconName } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { getCurrentMember } from '@/lib/members/session'
import { getSettings } from '@/lib/queries/settings'
import '@/styles/contact.css'
import '@/styles/members-auth.css'

export const dynamic = 'force-dynamic'

const DESCRIPTION = 'Gratuit et en une minute\u00a0: gardez vos vidéos préférées, retrouvez ce que vous avez regardé et suivez votre département.'

export const metadata: Metadata = {
  title: 'Créer un compte',
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  alternates: { canonical: '/inscription' },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Ce que l'espace membres apporte (colonne d'à-côté). */
const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'replay', title: 'Votre historique', text: 'Retrouvez en un clic les vidéos et les replays que vous avez regardés.' },
  { icon: 'bookmark', title: '«\u00a0Ma liste\u00a0»', text: 'Gardez de côté vidéos, replays, infos et sorties pour plus tard.' },
  { icon: 'pin', title: 'Votre département', text: 'La météo, l’info et les sorties de chez vous, réunies dans votre espace.' },
  { icon: 'shield', title: 'Gratuit, et vos données restent à vous', text: 'Téléchargez-les ou supprimez votre compte quand vous le souhaitez.' },
]

/** Inscription à l'espace membres (fermée si l'équipe l'a décidé dans les réglages du site). */
export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const retour = authReturn((await searchParams).retour)
  const member = await getCurrentMember().catch(() => null)
  if (member) redirect(retour)
  // réglages illisibles (base indisponible) : formulaire affiché, le serveur vérifie de toute façon à l'envoi
  const settings = await getSettings()
  const open = settings?.members?.signupOpen !== false
  const loginHref = withReturn('/connexion', retour)

  return (
    <>
      <PageHeader eyebrow="Mon espace" title="Créer un compte" description={DESCRIPTION} crumbs={[{ label: 'Créer un compte' }]} />
      <AuthShell
        asideLabel="Ce que vous offre votre espace"
        aside={
          <>
            <h2>Avec votre espace Swatter TV</h2>
            <ul className="auth-benefits">
              {BENEFITS.map((b) => (
                <li key={b.icon}>
                  <span className="auth-benefits__icon" aria-hidden="true">
                    <Icon name={b.icon} />
                  </span>
                  <span>
                    <b>{b.title}</b>
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
            <p className="auth-aside__privacy">
              Vos informations servent uniquement à faire fonctionner votre espace (et à vous écrire si vous l’acceptez). Voir la{' '}
              <Link href="/vie-privee">politique de confidentialité</Link>.
            </p>
          </>
        }
      >
        {/* heure du rendu serveur : le délai anti-robot de l'API se mesure avec l'horloge du serveur */}
        {open ? <SignupForm /> : <SignupClosed />}
        <AuthSwitch text={'Déjà un compte\u00a0?'} href={loginHref} label="Se connecter" />
      </AuthShell>
    </>
  )
}
