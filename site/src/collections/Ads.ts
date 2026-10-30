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
    {
      name: 'image',
      label: 'Visuel (bureau, 1940 × 500 conseillés)',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'Bannière horizontale, affichée jusqu’à 1272 pixels de large\u00a0: envoyez-la en 1940 × 500 pixels (le double de 970 × 250) pour qu’elle reste nette sur les écrans haute définition. Le cadre prend les proportions du visuel.',
      },
    },
    {
      name: 'imageMobile',
      label: 'Visuel mobile (conseillé, 1080 × 340)',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Affiché sur les téléphones à la place du visuel bureau. Sans lui, la bannière bureau y est réduite à environ 360 × 90 pixels\u00a0: son texte devient illisible. Envoyez 1080 × 340 pixels (ou un carré de 1080 × 1080), avec un texte court et gros.',
      },
    },
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
