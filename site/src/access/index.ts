import type { Access, FieldAccess, Where } from 'payload'
import { parisDateTime, parisDay } from '@/lib/format'

export const anyone: Access = () => true
export const authenticated: Access = ({ req }) => Boolean(req.user)
export const isAdmin: Access = ({ req }) => (req.user as { role?: string } | null)?.role === 'admin'
export const isAdminField: FieldAccess = ({ req }) => (req.user as { role?: string } | null)?.role === 'admin'
/** Rubriques techniques (comptes, redirections) : masquées dans le menu des éditeurs (admin.hidden). */
export const hiddenForEditors = ({ user }: { user?: unknown }) => (user as { role?: string } | null | undefined)?.role !== 'admin'

/**
 * Lecture publique des seuls contenus dont la date de publication est passée : une info ou une vidéo programmée
 * reste invisible dans l'API publique (/api/…) jusqu'à sa date ; l'équipe connectée voit tout.
 * (Le site lui-même interroge Payload par l'API locale, qui filtre déjà sur la date.)
 */
export const publishedOrAuthenticated: Access = ({ req }) => {
  if (req.user) return true
  const where: Where = { and: [{ _status: { equals: 'published' } }, { publishedAt: { less_than_equal: new Date().toISOString() } }] }
  return where
}

/** Contenus à brouillons sans date de publication (agenda, pages) : le public ne voit que les versions publiées. */
export const publishedStatusOrAuthenticated: Access = ({ req }) => (req.user ? true : { _status: { equals: 'published' } })

/**
 * Publicités en cours de diffusion : cochées actives et dans leur période. « Début » et « Fin » sont des jours (l'administration
 * les enregistre à midi UTC) : la campagne court du premier jour à 0 h jusqu'à la fin du dernier jour, heure de Paris.
 */
export function runningAdsWhere(now = new Date()): Where {
  const today = parisDay(now)
  const [y, m, d] = today.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return {
    and: [
      { active: { equals: true } },
      { or: [{ startsAt: { exists: false } }, { startsAt: { less_than: parisDateTime(tomorrow).toISOString() } }] },
      { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than_equal: parisDateTime(today).toISOString() } }] },
    ],
  }
}

/** Publicités : l'équipe connectée voit tout ; l'API publique, seulement les campagnes en cours (ni inactives ni à venir). */
export const runningAdsOrAuthenticated: Access = ({ req }) => (req.user ? true : { and: [{ _status: { equals: 'published' } }, runningAdsWhere()] })

/** Lecture publique des replays déjà diffusés ; l'équipe connectée voit aussi ceux programmés plus tard. */
export const airedOrAuthenticated: Access = ({ req }) => {
  if (req.user) return true
  const where: Where = { and: [{ _status: { equals: 'published' } }, { broadcastAt: { less_than_equal: new Date().toISOString() } }] }
  return where
}
