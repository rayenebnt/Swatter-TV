import type { CollectionConfig } from 'payload'
import { authenticated, publishedOrAuthenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { DEPARTMENTS } from '@/lib/departments'
import { articleUrl } from '@/lib/urls'

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Article', plural: 'L’Info (articles)' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'department', 'publishedAt', 'source'],
    description: 'Les articles écrits par l’équipe, et ceux importés automatiquement depuis les flux d’information (RSS).',
    preview: (doc) => (doc.slug ? articleUrl(doc as { slug: string; department?: string }) : null),
  },
  access: { read: publishedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  defaultSort: '-publishedAt',
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    { name: 'excerpt', label: 'Résumé', type: 'textarea', admin: { description: '2 ou 3 lignes, affichées sous le titre et dans les listes d’articles.' } },
    { name: 'image', label: 'Image', type: 'upload', relationTo: 'media', admin: { description: 'Une photo en largeur (format paysage), d’au moins 1200 pixels de large.' } },
    { name: 'content', label: 'Texte de l’article', type: 'richText' },
    { name: 'imageUrl', label: 'Image externe (import RSS)', type: 'text', admin: { readOnly: true, condition: (d) => d?.source === 'rss' } },
    {
      type: 'row',
      fields: [
        { name: 'department', label: 'Département', type: 'select', required: true, options: DEPARTMENTS.map(({ value, label }) => ({ value, label })), defaultValue: 'haute-savoie', index: true },
        { name: 'city', label: 'Commune', type: 'text' },
        { name: 'kicker', label: 'Rubrique', type: 'text', admin: { placeholder: 'Sport, Faits divers, Société…' } },
      ],
    },
    {
      name: 'publishedAt',
      label: 'Date de publication',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { position: 'sidebar', date: dateTimePicker(), description: 'Une date à venir programme l’article : il apparaîtra tout seul ce jour-là.' },
    },
    { name: 'isInfoOfDay', label: 'Info du jour', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Affichée dans « À la une ». Si plusieurs articles sont cochés, le plus récent l’emporte.' } },
    // Origine renseignée par l'import RSS : affichée pour information sur les articles importés seulement
    {
      name: 'source',
      label: 'Origine',
      type: 'select',
      defaultValue: 'manual',
      options: [{ label: 'Écrit par l’équipe', value: 'manual' }, { label: 'Importé (flux RSS)', value: 'rss' }],
      admin: { position: 'sidebar', readOnly: true, condition: (d) => d?.source === 'rss' },
    },
    { name: 'sourceName', label: 'Source', type: 'text', admin: { position: 'sidebar', condition: (d) => d?.source === 'rss' } },
    { name: 'sourceUrl', label: 'Lien de l’article d’origine', type: 'text', admin: { position: 'sidebar', condition: (d) => d?.source === 'rss' } },
    slugField(),
    { name: 'guid', type: 'text', unique: true, index: true, admin: { hidden: true } },
  ],
}
