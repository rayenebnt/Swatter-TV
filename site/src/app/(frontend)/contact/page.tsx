import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ContactForm } from '@/components/contact/ContactForm'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { getSettings } from '@/lib/queries/settings'
import '@/styles/contact.css'

export const revalidate = 60

const DESCRIPTION = 'Un événement, une info, une idée de reportage en Haute-Savoie ? Écrivez à la rédaction de Swatter TV : votre message lui est envoyé directement.'

export const metadata: Metadata = {
  title: 'Proposer une info, nous contacter',
  description: DESCRIPTION,
  alternates: { canonical: '/contact' },
}

/** Page « Proposer une info » : formulaire (envoyé par e-mail à la rédaction) et coordonnées de la chaîne. */
export default async function ContactPage() {
  const settings = await getSettings()
  const contact = settings?.contact
  const email = contact?.email?.trim()
  const phone = contact?.phone?.trim()
  const address = contact?.address?.trim()

  return (
    <>
      <PageHeader eyebrow="Contact" title="Proposer une info" description={DESCRIPTION} crumbs={[{ label: 'Proposer une info' }]} />
      <div className="container section--tight contact-page">
        <div className="contact-page__main">
          {/* le sujet se lit dans l'adresse (?sujet=publicite) : composant client sous Suspense */}
          <Suspense fallback={null}>
            <ContactForm />
          </Suspense>
        </div>
        <aside className="contact-page__side" aria-label="Autres moyens de nous joindre">
          <h2>Pour une info, pensez à préciser</h2>
          <ul className="contact-tips">
            <li>
              <Icon name="pin" /> le lieu : commune, quartier, route…
            </li>
            <li>
              <Icon name="clock" /> le jour et l’heure
            </li>
            <li>
              <Icon name="play" /> un lien vers vos photos ou votre vidéo, si vous en avez
            </li>
          </ul>
          {(email || phone || address) && (
            <>
              <h2>Nous joindre autrement</h2>
              <ul className="contact-tips">
                {email && (
                  <li>
                    <Icon name="mail" /> <a href={`mailto:${email}`}>{email}</a>
                  </li>
                )}
                {phone && <li>{phone}</li>}
                {address && <li className="contact-address">{address}</li>}
              </ul>
            </>
          )}
          <p className="contact-privacy">
            Vos informations servent uniquement à traiter votre demande. Voir la <Link href="/vie-privee">politique de confidentialité</Link>.
          </p>
        </aside>
      </div>
    </>
  )
}
