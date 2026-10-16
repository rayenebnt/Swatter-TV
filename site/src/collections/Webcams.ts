import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { revalidateHooks } from '@/hooks/revalidate'

export const Webcams: CollectionConfig = {
  slug: 'webcams',
  labels: { singular: 'Webcam', plural: 'Webcams' },
  admin: { useAsTitle: 'name', group: 'Contenus', defaultColumns: ['name', 'place', 'active', 'order'] },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
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
    slugField('name'),
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
    { name: 'embedUrl', label: 'Lien du flux', type: 'text', required: true },
    { name: 'image', label: 'Vignette', type: 'upload', relationTo: 'media', required: true },
    {
      type: 'row',
      fields: [
        { name: 'temperature', label: 'Température affichée (facultatif)', type: 'text', admin: { placeholder: '13°' } },
        { name: 'order', label: 'Ordre', type: 'number', defaultValue: 0 },
      ],
    },
    { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
}
