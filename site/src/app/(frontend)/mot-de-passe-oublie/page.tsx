import type { Metadata } from 'next'
import { AuthShell, AuthSwitch, authReturn, withReturn } from '@/components/members/auth/AuthShell'
import { ForgotForm } from '@/components/members/auth/ForgotForm'
import { PageHeader } from '@/components/ui/PageHeader'
import '@/styles/contact.css'
import '@/styles/members-auth.css'

export const dynamic = 'force-dynamic'

const DESCRIPTION = 'Indiquez l’adresse e-mail de votre compte\u00a0: nous vous envoyons un lien pour choisir un nouveau mot de passe.'

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  alternates: { canonical: '/mot-de-passe-oublie' },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Mot de passe oublié de l'espace membres : demande d'un lien par e-mail (valable une heure). */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const loginHref = withReturn('/connexion', authReturn((await searchParams).retour))
  return (
    <>
      <PageHeader
        eyebrow="Mon espace"
        title="Mot de passe oublié"
        description={DESCRIPTION}
        crumbs={[{ label: 'Connexion', href: loginHref }, { label: 'Mot de passe oublié' }]}
      />
      <AuthShell>
        <h2 className="auth-title">Recevoir un lien</h2>
        <ForgotForm loginHref={loginHref} />
        <AuthSwitch text={'Vous l’avez retrouvé\u00a0?'} href={loginHref} label="Se connecter" />
      </AuthShell>
    </>
  )
}
