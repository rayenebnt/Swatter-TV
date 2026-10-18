import type { CollectionConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { PROGRAM_GENRES } from '@/lib/categories'

export const Programs: CollectionConfig = {
  slug: 'programs',
  labels: { singular: 'Émission', plural: 'Émissions' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'genre', 'isPremiere'],
    description: 'Les émissions de la chaîne. Une émission créée ici se choisit ensuite dans la grille et dans les replays.',
  },
  access: { read: publishedStatusOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    { name: 'genre', label: 'Genre', type: 'select', required: true, options: [...PROGRAM_GENRES], defaultValue: 'magazine' },
    { name: 'image', label: 'Image', type: 'upload', relationTo: 'media' },
    { name: 'synopsis', label: 'Résumé', type: 'textarea' },
    { name: 'isPremiere', label: 'Inédit', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Affiche l’étiquette « Inédit » dans la grille.' } },
    slugField(),
  ],
}
