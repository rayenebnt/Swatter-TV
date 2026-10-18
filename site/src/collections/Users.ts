import type { CollectionConfig } from 'payload'
import { authenticated, isAdmin, isAdminField } from '@/access'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Utilisateur', plural: 'Utilisateurs' },
  admin: { useAsTitle: 'email', group: 'Réglages', defaultColumns: ['name', 'email', 'role'] },
  auth: { maxLoginAttempts: 5, lockTime: 10 * 60 * 1000 },
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
    { name: 'name', label: 'Nom', type: 'text' },
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
