import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthNotice, AuthShell, AuthSwitch, authReturn, firstParam, withReturn } from '@/components/members/auth/AuthShell'
import { LoginForm } from '@/components/members/auth/LoginForm'
import { ResendConfirmation } from '@/components/members/auth/ResendConfirmation'
import { PageHeader } from '@/components/ui/PageHeader'
import { getCurrentMember } from '@/lib/members/session'
import { checkEmail, normalizeEmail } from '@/lib/members/shared'
import '@/styles/contact.css'
import '@/styles/members-auth.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à votre espace Swatter TV\u00a0: historique, «\u00a0Ma liste\u00a0» et actualité de votre département.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/connexion' },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Connexion à l'espace membres. ?retour=<chemin> : page où revenir ensuite. Lien de confirmation reçu par e-mail
 * (/compte/verifier) : ?confirmer=1&email=… (dernière étape : le mot de passe confirme le compte), ?verifie=deja,
 * ?verification=invalide. Après « Se déconnecter de tous les appareils » : ?deconnecte=partout.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await searchParams
  const retour = authReturn(q.retour)
  // déjà connecté : directement vers la page demandée (redirect hors de tout try)
  const member = await getCurrentMember().catch(() => null)
  if (member) redirect(retour)

  const verified = firstParam(q.verifie)
  const confirming = firstParam(q.confirmer) === '1'
  const invalid = firstParam(q.verification) === 'invalide'
  const loggedOutEverywhere = firstParam(q.deconnecte) === 'partout'
  const rawEmail = normalizeEmail(firstParam(q.email))
  const email = rawEmail && !checkEmail(rawEmail) ? rawEmail : ''

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
        {confirming && (
          <AuthNotice tone="info" role="status" title={'Dernière étape\u00a0: saisissez votre mot de passe'}>
            <p>Pour activer votre compte, connectez-vous avec le mot de passe choisi lors de votre inscription.</p>
          </AuthNotice>
        )}
        {verified === 'deja' && (
          <AuthNotice tone="ok" role="status" title="Votre adresse est déjà confirmée.">
            <p>Vous pouvez vous connecter avec votre e-mail et votre mot de passe.</p>
          </AuthNotice>
        )}
        {loggedOutEverywhere && (
          <AuthNotice tone="ok" role="status" title="Tous vos appareils sont déconnectés.">
            <p>Pour revenir dans votre espace, reconnectez-vous ici avec votre e-mail et votre mot de passe.</p>
          </AuthNotice>
        )}
        {invalid && (
          <AuthNotice tone="warn" title="Ce lien de confirmation n’est plus valable.">
            <p>Il a expiré (il sert pendant 48&nbsp;heures) ou il est incomplet. Recevez un nouveau lien&nbsp;:</p>
            <ResendConfirmation defaultEmail={email} />
          </AuthNotice>
        )}
        <LoginForm retour={retour} email={email} forgotHref={withReturn('/mot-de-passe-oublie', retour)} />
        <AuthSwitch text={'Pas encore de compte\u00a0?'} href={withReturn('/inscription', retour)} label="Créer un compte gratuit" />
      </AuthShell>
    </>
  )
}
