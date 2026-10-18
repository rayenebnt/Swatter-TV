import type { CollectionConfig } from 'payload'
import { airedOrAuthenticated, authenticated } from '@/access'
import { slugField } from '@/fields/slug'
import { videoSourceField } from '@/fields/videoSource'
import { revalidateHooks } from '@/hooks/revalidate'

export const Replays: CollectionConfig = {
  slug: 'replays',
  labels: { singular: 'Replay', plural: 'Replays' },
  admin: { useAsTitle: 'title', group: 'Contenus', defaultColumns: ['title', 'program', 'broadcastAt'] },
  access: { read: airedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  defaultSort: '-broadcastAt',
  hooks: revalidateHooks,
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    slugField(),
    { name: 'program', label: 'Émission', type: 'relationship', relationTo: 'programs' },
    { name: 'thumbnail', label: 'Image (vignette)', type: 'upload', relationTo: 'media', required: true },
    videoSourceField(),
    {
      type: 'row',
      fields: [
        { name: 'broadcastAt', label: 'Diffusé le', type: 'date', required: true, index: true, defaultValue: () => new Date().toISOString(), admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'duration', label: 'Durée', type: 'text', admin: { placeholder: '52 min' } },
      ],
    },
    { name: 'description', label: 'Description', type: 'textarea' },
  ],
}
