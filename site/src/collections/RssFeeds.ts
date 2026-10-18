import type { CollectionConfig } from 'payload'
import { authenticated, hiddenForEditors } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { DEPARTMENTS } from '@/lib/departments'

export const RssFeeds: CollectionConfig = {
  slug: 'rss-feeds',
  labels: { singular: 'Flux RSS', plural: 'Flux RSS (import de l’info)' },
  admin: {
    useAsTitle: 'name',
    hidden: hiddenForEditors,
    defaultColumns: ['name', 'department', 'active', 'lastFetchedAt'],
    description: 'Les articles de ces flux sont importés automatiquement dans « L’Info », toutes les heures.',
  },
  access: { read: authenticated, create: authenticated, update: authenticated, delete: authenticated },
  fields: [
    { name: 'name', label: 'Nom', type: 'text', required: true },
    { name: 'url', label: 'Adresse du flux RSS', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'department', label: 'Département', type: 'select', required: true, options: DEPARTMENTS.map(({ value, label }) => ({ value, label })), defaultValue: 'haute-savoie' },
        { name: 'city', label: 'Commune par défaut', type: 'text' },
        { name: 'kicker', label: 'Rubrique par défaut', type: 'text' },
      ],
    },
    { name: 'active', label: 'Actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    { name: 'lastFetchedAt', label: 'Dernier import', type: 'date', admin: { position: 'sidebar', readOnly: true, date: dateTimePicker() } },
    { name: 'lastError', label: 'Dernière erreur', type: 'text', admin: { position: 'sidebar', readOnly: true } },
  ],
}
