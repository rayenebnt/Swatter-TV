import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { LogoutButton } from '@/components/members/space/LogoutButton'
import { SpaceNav } from '@/components/members/space/SpaceNav'
import { PageHeader } from '@/components/ui/PageHeader'
import { renderNow } from '@/components/video/utils'
import { formatTime } from '@/lib/format'
import { getCurrentMember } from '@/lib/members/session'
import { ofPlace } from '@/lib/places'
// champs de formulaire et messages communs, puis styles de l'espace (dans cet ordre)
import '@/styles/contact.css'
import '@/styles/members-space.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** « Bonsoir » à partir de 18 h (heure de Paris), « Bonjour » le reste de la journée. */
function greeting(): string {
  const hour = Number(formatTime(new Date(renderNow())).slice(0, 2))
  return hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour'
}

/**
 * Mise en page de « Mon espace » (/compte et ses pages) : en-tête avec salutation et déconnexion, onglets de navigation.
 * Groupe de routes (espace) : la page publique /compte/nouveau-mot-de-passe n'en fait pas partie. La protection (membre
 * connecté) est faite par chaque page, qui seule connaît son adresse de retour ; sans membre, l'en-tête reste neutre.
 */
export default async function SpaceLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentMember()
  const title = member ? `${greeting()} ${member.firstName}` : 'Mon espace'
  const description = member?.department
    ? `Vos vidéos, votre liste et l’actualité ${ofPlace(member.department)}, au même endroit.`
    : 'Vos vidéos, votre liste et vos réglages, au même endroit.'
  return (
    <>
      <PageHeader eyebrow="Mon espace" title={title} description={description} crumbs={[{ label: 'Mon espace', href: '/compte' }]}>
        {member && <LogoutButton />}
      </PageHeader>
      <div className="container space-bar">
        <SpaceNav />
      </div>
      {children}
    </>
  )
}
