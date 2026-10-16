import type { Field } from 'payload'
import { slugify } from '@/lib/slugify'

/** Champ « slug » (adresse de la page), rempli automatiquement depuis le titre. */
export const slugField = (source = 'title'): Field => ({
  name: 'slug',
  label: 'Adresse (slug)',
  type: 'text',
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Partie finale de l’adresse de la page. Laissez vide pour la générer depuis le titre.',
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        if (typeof value === 'string' && value.trim()) return slugify(value)
        const from = data?.[source]
        return typeof from === 'string' && from ? slugify(from) : value
      },
    ],
  },
})
