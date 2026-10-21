import type { CollectionConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { departmentField } from '@/fields/department'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'
import { EVENT_CATEGORIES } from '@/lib/categories'
import { eventUrl } from '@/lib/urls'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Événement', plural: 'Agenda' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'startDate', 'city', 'department', 'isWeekendPick'],
    description: 'Les sorties et événements de la région. Ils disparaissent tout seuls de l’agenda une fois passés.',
    preview: (doc) => (doc.slug ? eventUrl(doc as { slug: string }) : null),
  },
  access: { read: publishedStatusOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  defaultSort: 'startDate',
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'startDate', label: 'Début', type: 'date', required: true, index: true, admin: { date: dateTimePicker() } },
        { name: 'endDate', label: 'Fin (facultatif)', type: 'date', admin: { date: dateTimePicker(), description: 'Pour un événement sur plusieurs jours.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'city', label: 'Commune', type: 'text', required: true },
        departmentField('Les visiteurs peuvent filtrer l’agenda par département.'),
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'place', label: 'Lieu', type: 'text', admin: { placeholder: 'Salle des fêtes, place du marché…' } },
        { name: 'category', label: 'Catégorie', type: 'select', options: [...EVENT_CATEGORIES], defaultValue: 'autre' },
      ],
    },
    { name: 'poster', label: 'Affiche ou photo', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Présentation', type: 'textarea' },
    {
      name: 'program',
      label: 'Programme de la journée (facultatif)',
      type: 'array',
      labels: { singular: 'Moment', plural: 'Programme' },
      admin: {
        description: 'Ajoutez un moment par horaire : « 10h30 — Ouverture du marché »…',
        initCollapsed: true,
        components: { RowLabel: '/components/admin/RowLabels#MomentLabel' },
      },
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
    { name: 'externalUrl', label: 'Lien externe (billetterie, office de tourisme…)', type: 'text', admin: { placeholder: 'https://…' } },
    { name: 'isWeekendPick', label: 'Sortie du week-end', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Mise en avant dans « À la une » et sur l’accueil.' } },
    slugField(),
  ],
}
