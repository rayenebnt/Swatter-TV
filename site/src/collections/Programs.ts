import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { PROGRAM_GENRES } from '@/lib/categories'

export const Programs: CollectionConfig = {
  slug: 'programs',
  labels: { singular: 'Émission', plural: 'Émissions' },
  admin: { useAsTitle: 'title', group: 'Programme TV', defaultColumns: ['title', 'genre', 'isPremiere'] },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    slugField(),
    { name: 'genre', label: 'Genre', type: 'select', required: true, options: [...PROGRAM_GENRES], defaultValue: 'magazine' },
    { name: 'image', label: 'Image', type: 'upload', relationTo: 'media' },
    { name: 'synopsis', label: 'Résumé', type: 'textarea' },
    { name: 'isPremiere', label: 'Inédit', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar' } },
  ],
}
