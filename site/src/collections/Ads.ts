import type { CollectionConfig } from 'payload'
import { authenticated, runningAdsOrAuthenticated } from '@/access'
import { dayPicker } from '@/fields/date'
import { draftVersions } from '@/fields/drafts'
import { revalidateHooks } from '@/hooks/revalidate'

export const Ads: CollectionConfig = {
  slug: 'ads',
  labels: { singular: 'Publicité', plural: 'Publicités' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'placement', 'active', 'endsAt'],
    description: 'Les bannières des annonceurs. Une publicité s’affiche du jour de début au jour de fin inclus, si elle est cochée « Active ».',
  },
  access: { read: runningAdsOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  hooks: revalidateHooks,
  fields: [
    { name: 'name', label: 'Annonceur / campagne', type: 'text', required: true },
    {
      name: 'placement',
      label: 'Emplacement',
      type: 'select',
      required: true,
      defaultValue: 'home-leaderboard',
      options: [
        { label: 'Accueil — bannière horizontale', value: 'home-leaderboard' },
        { label: 'Pages intérieures — bannière', value: 'inner-leaderboard' },
      ],
    },
    { name: 'image', label: 'Visuel (bureau, 970 × 250)', type: 'upload', relationTo: 'media', required: true },
    { name: 'imageMobile', label: 'Visuel mobile (facultatif, 320 × 100)', type: 'upload', relationTo: 'media' },
    { name: 'link', label: 'Lien (site de l’annonceur)', type: 'text', admin: { placeholder: 'https://…' } },
    {
      type: 'row',
      fields: [
        { name: 'startsAt', label: 'Premier jour', type: 'date', admin: { date: dayPicker(), description: 'Vide : dès maintenant.' } },
        { name: 'endsAt', label: 'Dernier jour', type: 'date', admin: { date: dayPicker(), description: 'Vide : sans date de fin.' } },
      ],
    },
    { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar', description: 'Décochez pour suspendre la campagne sans la supprimer.' } },
  ],
}
