import type { CollectionConfig } from 'payload'
import { authenticated, hiddenForEditors, isAdmin, isAdminField } from '@/access'
import { SITE_URL } from '@/lib/site'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** E-mail « Mot de passe oublié » : lien vers la page de réinitialisation de l'administration, valable une heure. */
export function resetEmail(token: string, user?: { name?: string | null; email?: string | null } | null): string {
  const link = `${SITE_URL}/admin/reset/${encodeURIComponent(token)}`
  const hello = user?.name?.trim() ? `Bonjour ${esc(user.name.trim().split(/\s+/)[0])},` : 'Bonjour,'
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1b;max-width:560px">
<p>${hello}</p>
<p>Une demande de nouveau mot de passe a été faite pour votre compte d'administration du site Swatter TV${user?.email ? ` (${esc(user.email)})` : ''}.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#e3b23c;color:#1b1b1b;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Choisir un nouveau mot de passe</a></p>
<p>Ce lien est valable une heure. S'il ne s'ouvre pas, copiez cette adresse dans votre navigateur :<br><a href="${link}">${link}</a></p>
<p style="color:#888;font-size:13px">Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail : votre mot de passe actuel reste valable.</p>
</div>`
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Utilisateur', plural: 'Utilisateurs' },
  admin: {
    useAsTitle: 'email',
    hidden: hiddenForEditors,
    defaultColumns: ['name', 'email', 'role'],
    description: 'Les personnes qui peuvent se connecter. Un éditeur publie les contenus ; un administrateur gère aussi les comptes et les réglages techniques.',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    // « Mot de passe oublié ? » sur la page de connexion : e-mail en français (envoyé par SMTP, voir README)
    forgotPassword: {
      expiration: 60 * 60 * 1000,
      generateEmailSubject: () => 'Swatter TV — choisir un nouveau mot de passe',
      generateEmailHTML: (args) => resetEmail(args?.token ?? '', args?.user as { name?: string; email?: string } | undefined),
    },
  },
  hooks: {
    beforeChange: [
      // Le tout premier compte (créé depuis /admin sur une base vide) est administrateur, sinon personne ne pourrait gérer les comptes
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const { totalDocs } = await req.payload.count({ collection: 'users', req })
        return totalDocs === 0 ? { ...data, role: 'admin' } : data
      },
    ],
  },
  access: {
    read: authenticated,
    create: isAdmin,
    // Administrateur : tous les comptes ; éditeur : le sien seulement (contrainte valable aussi pour une modification
    // groupée, où `id` est absent) ; anonyme : refus
    update: ({ req }) => {
      if (!req.user) return false
      return (req.user as { role?: string }).role === 'admin' || { id: { equals: req.user.id } }
    },
    delete: isAdmin,
    admin: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: 'name', label: 'Prénom et nom', type: 'text', admin: { description: 'Le prénom sert à vous saluer sur le tableau de bord.' } },
    {
      name: 'role',
      label: 'Rôle',
      type: 'select',
      required: true,
      defaultValue: 'editeur',
      options: [
        { label: 'Administrateur', value: 'admin' },
        { label: 'Éditeur', value: 'editeur' },
      ],
      access: { update: isAdminField },
      saveToJWT: true,
    },
  ],
}
