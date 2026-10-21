import type { CollectionConfig } from 'payload'
import { authenticated, publishedStatusOrAuthenticated } from '@/access'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { WEBCAM_ZONES } from '@/lib/departments'
import { revalidateHooks } from '@/hooks/revalidate'

export const Webcams: CollectionConfig = {
  slug: 'webcams',
  labels: { singular: 'Webcam', plural: 'Webcams' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'place', 'department', 'active', 'order'],
    description:
      'Les vues en direct de la page « Webcams ». Une webcam sans lien de flux s’affiche « Bientôt en direct ». Décochez « Active » pour masquer une webcam sans la supprimer.',
  },
  access: { read: publishedStatusOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  defaultSort: 'order',
  hooks: revalidateHooks,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', label: 'Nom', type: 'text', required: true, admin: { placeholder: 'Lac du Bourget' } },
        { name: 'place', label: 'Lieu précis', type: 'text', admin: { placeholder: 'Port d’Aix-les-Bains' } },
      ],
    },
    {
      name: 'department',
      label: 'Département',
      type: 'select',
      required: true,
      defaultValue: 'haute-savoie',
      index: true,
      options: WEBCAM_ZONES.map(({ value, label }) => ({ value, label: value === 'plus' ? 'Web Cams + (hors région : Suisse, Vallée d’Aoste…)' : label })),
      admin: { description: 'Les visiteurs filtrent les webcams par département ; « Web Cams + » regroupe les vues hors de la région.' },
    },
    {
      name: 'provider',
      label: 'Type de flux',
      type: 'select',
      required: true,
      defaultValue: 'iframe',
      options: [
        { label: 'Lecteur à intégrer (lien iframe : Windy, Skaping, ViewSurf…)', value: 'iframe' },
        { label: 'Flux vidéo HLS (.m3u8)', value: 'hls' },
        { label: 'YouTube Live', value: 'youtube' },
        { label: 'Image rafraîchie (lien vers une image)', value: 'image' },
      ],
    },
    {
      name: 'embedUrl',
      label: 'Lien du flux',
      type: 'text',
      admin: {
        description: 'Fourni par le service de la webcam (bouton « Intégrer » ou « Partager »). Laissé vide, la webcam s’affiche « Bientôt en direct ».',
      },
    },
    {
      name: 'image',
      label: 'Image d’aperçu',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Affichée avant le chargement de la webcam (facultative : sans image, un visuel de la chaîne la remplace).' },
    },
    {
      type: 'row',
      fields: [
        { name: 'temperature', label: 'Température affichée (facultatif)', type: 'text', admin: { placeholder: '13°' } },
        { name: 'order', label: 'Ordre d’affichage', type: 'number', defaultValue: 0, admin: { description: 'Les plus petits nombres en premier.' } },
      ],
    },
    { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    slugField('name'),
  ],
}
