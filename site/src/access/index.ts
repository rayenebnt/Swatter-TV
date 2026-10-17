import type { Access, FieldAccess } from 'payload'

export const anyone: Access = () => true
export const authenticated: Access = ({ req }) => Boolean(req.user)
export const isAdmin: Access = ({ req }) => (req.user as { role?: string } | null)?.role === 'admin'
export const isAdminField: FieldAccess = ({ req }) => (req.user as { role?: string } | null)?.role === 'admin'

/**
 * Lecture publique des seuls contenus dont la date de publication est passée : une info ou une vidéo programmée
 * reste invisible dans l'API publique (/api/…) jusqu'à sa date ; l'équipe connectée voit tout.
 * (Le site lui-même interroge Payload par l'API locale, qui filtre déjà sur la date.)
 */
export const publishedOrAuthenticated: Access = ({ req }) => {
  if (req.user) return true
  return { publishedAt: { less_than_equal: new Date().toISOString() } }
}
