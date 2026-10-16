import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { EVENT_CATEGORIES } from '@/lib/categories'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Événement', plural: 'Agenda' },
  admin: { useAsTitle: 'title', group: 'Contenus', defaultColumns: ['title', 'startDate', 'city', 'isWeekendPick'] },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  defaultSort: 'startDate',
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    slugField(),
    {
      type: 'row',
      fields: [
        { name: 'startDate', label: 'Date de début', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'endDate', label: 'Date de fin', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'city', label: 'Commune', type: 'text', required: true },
        { name: 'place', label: 'Lieu', type: 'text' },
        { name: 'category', label: 'Catégorie', type: 'select', options: [...EVENT_CATEGORIES], defaultValue: 'autre' },
      ],
    },
    { name: 'poster', label: 'Affiche / image', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Présentation', type: 'textarea' },
    {
      name: 'program',
      label: 'Programme de la journée',
      type: 'array',
      labels: { singular: 'Moment', plural: 'Programme' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'time', label: 'Horaire', type: 'text', required: true, admin: { placeholder: '10h30 ou Toute la journée' } },
            { name: 'label', label: 'Description', type: 'text', required: true },
          ],
        },
      ],
    },
    { name: 'externalUrl', label: 'Lien externe (billetterie, office de tourisme…)', type: 'text' },
    { name: 'isWeekendPick', label: 'Sortie du week-end', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Mise en avant dans « À la une » et sur l’accueil.' } },
  ],
}
