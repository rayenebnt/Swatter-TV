import type { CollectionConfig } from 'payload'
import { authenticated, publishedOrAuthenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { DEPARTMENTS } from '@/lib/departments'

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Article', plural: 'L’Info (articles)' },
  admin: {
    useAsTitle: 'title',
    group: 'Contenus',
    defaultColumns: ['title', 'department', 'publishedAt', 'source'],
    description: 'Articles saisis par l’équipe ou importés automatiquement depuis les flux RSS.',
  },
  access: { read: publishedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  defaultSort: '-publishedAt',
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    slugField(),
    { name: 'excerpt', label: 'Chapô (résumé)', type: 'textarea', admin: { description: '2 ou 3 lignes affichées sous le titre.' } },
    { name: 'content', label: 'Texte de l’article', type: 'richText' },
    { name: 'image', label: 'Image', type: 'upload', relationTo: 'media' },
    { name: 'imageUrl', label: 'Image externe (import RSS)', type: 'text', admin: { readOnly: true, condition: (d) => d?.source === 'rss' } },
    {
      type: 'row',
      fields: [
        { name: 'department', label: 'Département', type: 'select', required: true, options: DEPARTMENTS.map(({ value, label }) => ({ value, label })), defaultValue: 'haute-savoie', index: true },
        { name: 'city', label: 'Commune', type: 'text' },
        { name: 'kicker', label: 'Rubrique', type: 'text', admin: { placeholder: 'Sport, Faits divers, Société…' } },
      ],
    },
    { name: 'publishedAt', label: 'Date de publication', type: 'date', required: true, index: true, defaultValue: () => new Date().toISOString(), admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'isInfoOfDay', label: 'Info du jour', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Affichée dans « À la une ».' } },
    { name: 'source', label: 'Origine', type: 'select', defaultValue: 'manual', options: [{ label: 'Saisie manuelle', value: 'manual' }, { label: 'Flux RSS', value: 'rss' }], admin: { position: 'sidebar' } },
    { name: 'sourceName', label: 'Source', type: 'text', admin: { position: 'sidebar', condition: (d) => d?.source === 'rss' } },
    { name: 'sourceUrl', label: 'Lien de l’article d’origine', type: 'text', admin: { position: 'sidebar', condition: (d) => d?.source === 'rss' } },
    { name: 'guid', type: 'text', unique: true, index: true, admin: { hidden: true } },
  ],
}
