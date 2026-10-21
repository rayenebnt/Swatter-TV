'use client'
// Bouton rond de l'en-tête : « Mon espace » pour un membre connecté, sinon connexion / création de compte.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { useMemberHint } from '@/lib/members/browser'
import { loginHref } from '@/lib/members/shared'

/**
 * L'en-tête est rendu dans des pages mises en cache : l'état vient du cookie témoin, lu dans le navigateur
 * (rendu serveur et hydratation : « Se connecter », puis « Mon espace » si un membre est connecté).
 * Pas de préchargement : ces pages sont dynamiques et le lien est visible sur toutes les pages du site.
 * Après la connexion, le visiteur revient sur la page où il a cliqué (?retour=).
 */
export function AccountButton() {
  const member = useMemberHint()
  const pathname = usePathname()
  const label = member ? 'Mon espace' : 'Se connecter ou créer un compte'
  return (
    <Link className={`icon-btn account${member ? ' is-member' : ''}`} href={member ? '/compte' : loginHref(pathname)} aria-label={label} title={label} prefetch={false}>
      <Icon name="user" className="ico" />
      {member && <span className="account__dot" aria-hidden="true" />}
    </Link>
  )
}
