// « Mon espace » : protection des pages (membre connecté exigé) et métadonnées communes (pages non indexées).
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentMember } from '@/lib/members/session'
import type { Member } from '@/payload-types'

/**
 * Membre connecté de la page `path` (ex. '/compte/historique'), sinon renvoi vers la connexion qui ramènera ici.
 * À appeler en tête de chaque page de l'espace : le layout du groupe ne connaît pas le chemin demandé.
 */
export async function requireMember(path: string): Promise<Member> {
  const member = await getCurrentMember()
  if (!member) redirect(`/connexion?retour=${encodeURIComponent(path)}`)
  return member
}

/** Métadonnées d'une page de l'espace : titre propre, jamais indexée ni suivie (pages personnelles, hors plan du site). */
export function spaceMetadata(title: string, description = 'Votre espace Swatter TV Info : historique, liste et réglages.'): Metadata {
  return { title, description, robots: { index: false, follow: false } }
}
