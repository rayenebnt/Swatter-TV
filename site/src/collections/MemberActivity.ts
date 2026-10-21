import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access'
import { FAVORITE_KINDS, HISTORY_KINDS, KIND_LABELS } from '@/lib/members/shared'

/**
 * Activité des membres : historique des vidéos regardées et « Ma liste ». Une ligne par membre et par contenu
 * (index unique). Écrites par l'API /api/compte (API locale) ; aucune modification par l'API publique ni par l'équipe,
 * qui n'en voit que des chiffres (fiche membre, tableau de bord). Masquées du menu de l'administration.
 */
const activity = (slug: 'member-history' | 'member-favorites', kinds: readonly string[], dateField: string, dateLabel: string): CollectionConfig => ({
  slug,
  labels: slug === 'member-history' ? { singular: 'Vidéo regardée', plural: 'Historique des membres' } : { singular: 'Contenu gardé', plural: 'Listes des membres' },
  admin: { hidden: true, useAsTitle: 'id' },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  indexes: [{ fields: ['member', 'kind', 'itemId'], unique: true }],
  defaultSort: `-${dateField}`,
  fields: [
    { name: 'member', label: 'Membre', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'kind', label: 'Type', type: 'select', required: true, options: kinds.map((k) => ({ value: k, label: KIND_LABELS[k as keyof typeof KIND_LABELS] })) },
    { name: 'itemId', label: 'Contenu (numéro)', type: 'number', required: true, index: true },
    { name: dateField, label: dateLabel, type: 'date', required: true, index: true },
  ],
})

export const MemberHistory = activity('member-history', HISTORY_KINDS, 'watchedAt', 'Regardée le')
export const MemberFavorites = activity('member-favorites', FAVORITE_KINDS, 'savedAt', 'Ajouté le')
