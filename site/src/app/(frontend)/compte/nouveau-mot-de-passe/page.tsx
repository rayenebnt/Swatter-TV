import type { Metadata } from 'next'
import { AuthShell, firstParam } from '@/components/members/auth/AuthShell'
import { ResetForm, ResetInvalid } from '@/components/members/auth/ResetForm'
import { PageHeader } from '@/components/ui/PageHeader'
import '@/styles/contact.css'
import '@/styles/members-auth.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nouveau mot de passe',
  description: 'Choisissez un nouveau mot de passe pour votre espace Swatter TV Info.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/compte/nouveau-mot-de-passe' },
  // le lien contient un jeton secret : il ne doit pas partir vers un autre site
  referrer: 'no-referrer',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Lien « mot de passe oublié » reçu par e-mail : /compte/nouveau-mot-de-passe?token=…. Accessible sans être connecté
 * (hors des pages protégées de l'espace) ; le jeton n'est vérifié qu'à l'envoi du formulaire.
 */
export default async function NewPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = firstParam((await searchParams).token).trim()
  const token = raw.length > 0 && raw.length <= 200 ? raw : ''
  return (
    <>
      <PageHeader
        eyebrow="Mon espace"
        title="Nouveau mot de passe"
        description={'Choisissez un nouveau mot de passe\u00a0: vous serez ensuite connecté à votre espace.'}
        crumbs={[{ label: 'Connexion', href: '/connexion' }, { label: 'Nouveau mot de passe' }]}
      />
      <AuthShell>
        <h2 className="auth-title">Choisir un mot de passe</h2>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <ResetInvalid title="Ce lien est incomplet." message="Copiez l’adresse complète reçue par e-mail, ou faites une nouvelle demande." />
        )}
      </AuthShell>
    </>
  )
}
