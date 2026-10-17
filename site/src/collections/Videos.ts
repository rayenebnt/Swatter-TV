import type { CollectionConfig } from 'payload'
import { authenticated, publishedOrAuthenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { videoSourceField } from '@/fields/videoSource'
import { revalidateHooks } from '@/hooks/revalidate'
import { VIDEO_CATEGORIES } from '@/lib/categories'

export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: { singular: 'Vidéo', plural: 'Vidéos' },
  admin: {
    useAsTitle: 'title',
    group: 'Contenus',
    defaultColumns: ['title', 'category', 'publishedAt', 'isVideoOfDay'],
    description: 'Vidéos du jour, Top 10 et vidéos à la demande.',
  },
  access: { read: publishedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  defaultSort: '-publishedAt',
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    slugField(),
    {
      type: 'row',
      fields: [
        { name: 'category', label: 'Catégorie', type: 'select', required: true, options: [...VIDEO_CATEGORIES], defaultValue: 'divertissement' },
        { name: 'duration', label: 'Durée', type: 'text', admin: { placeholder: '02:14 ou 1:34:00' } },
      ],
    },
    { name: 'thumbnail', label: 'Image (vignette)', type: 'upload', relationTo: 'media', required: true },
    videoSourceField(),
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'publishedAt', label: 'Date de publication', type: 'date', required: true, defaultValue: () => new Date().toISOString(), index: true, admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'isVideoOfDay', label: 'Vidéo du jour', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Affichée en grand dans « À la une ».' } },
    { name: 'top10Rank', label: 'Place dans le Top 10', type: 'number', min: 1, max: 10, admin: { position: 'sidebar', description: '1 à 10. Laissez vide si la vidéo n’est pas dans le Top 10.' } },
    { name: 'views', label: 'Nombre de vues', type: 'number', defaultValue: 0, admin: { position: 'sidebar', readOnly: true } },
  ],
}
