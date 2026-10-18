import type { CollectionConfig } from 'payload'
import { authenticated, runningAdsOrAuthenticated } from '@/access'
import { revalidateHooks } from '@/hooks/revalidate'

export const Ads: CollectionConfig = {
  slug: 'ads',
  labels: { singular: 'Publicité', plural: 'Publicités' },
  admin: { useAsTitle: 'name', group: 'Contenus', defaultColumns: ['name', 'placement', 'active', 'endsAt'] },
  access: { read: runningAdsOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
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
    { name: 'link', label: 'Lien', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'startsAt', label: 'Début', type: 'date' },
        { name: 'endsAt', label: 'Fin', type: 'date' },
      ],
    },
    { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
}
