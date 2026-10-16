import type { Access, FieldAccess } from 'payload'

export const anyone: Access = () => true
export const authenticated: Access = ({ req }) => Boolean(req.user)
export const isAdmin: Access = ({ req }) => (req.user as { role?: string } | null)?.role === 'admin'
export const isAdminField: FieldAccess = ({ req }) => (req.user as { role?: string } | null)?.role === 'admin'

/** Lecture publique des contenus publiés ; les brouillons restent réservés à l'équipe. */
export const publishedOrAuthenticated: Access = ({ req }) => {
  if (req.user) return true
  return { _status: { equals: 'published' } }
}
