import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthNotice, AuthShell, AuthSwitch, authReturn, firstParam, withReturn } from '@/components/members/auth/AuthShell'
import { LoginForm } from '@/components/members/auth/LoginForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { getCurrentMember } from '@/lib/members/session'
import '@/styles/contact.css'
import '@/styles/members-auth.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à votre espace Swatter TV Info\u00a0: historique, «\u00a0Ma liste\u00a0» et actualité de votre département.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/connexion' },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Connexion à l'espace membres. ?retour=<chemin> : page où revenir ensuite. Après « Se déconnecter de tous les
 * appareils » : ?deconnecte=partout.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await searchParams
  const retour = authReturn(q.retour)
  // déjà connecté : directement vers la page demandée (redirect hors de tout try)
  const member = await getCurrentMember().catch(() => null)
  if (member) redirect(retour)

  const loggedOutEverywhere = firstParam(q.deconnecte) === 'partout'

  return (
    <>
      <PageHeader
        eyebrow="Mon espace"
        title="Connexion"
        description={'Retrouvez votre historique, «\u00a0Ma liste\u00a0» et l’actualité de votre département.'}
        crumbs={[{ label: 'Connexion' }]}
      />
      <AuthShell>
        <h2 className="auth-title">Accédez à votre espace</h2>
        {loggedOutEverywhere && (
          <AuthNotice tone="ok" role="status" title="Tous vos appareils sont déconnectés.">
            <p>Pour revenir dans votre espace, reconnectez-vous ici avec votre e-mail et votre mot de passe.</p>
          </AuthNotice>
        )}
        <LoginForm retour={retour} forgotHref={withReturn('/mot-de-passe-oublie', retour)} />
        <AuthSwitch text={'Pas encore de compte\u00a0?'} href={withReturn('/inscription', retour)} label="Créer un compte gratuit" />
      </AuthShell>
    </>
  )
}
