import type { CollectionConfig } from 'payload'
import { airedOrAuthenticated, authenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { slugField } from '@/fields/slug'
import { videoSourceField } from '@/fields/videoSource'
import { revalidateHooks } from '@/hooks/revalidate'
import { thumbnailUnlessYoutube, youtubeThumbnail } from '@/hooks/youtubeThumbnail'
import { replayUrl } from '@/lib/urls'

export const Replays: CollectionConfig = {
  slug: 'replays',
  labels: { singular: 'Replay', plural: 'Replays' },
  admin: {
    useAsTitle: 'title',
    group: 'Publier',
    defaultColumns: ['title', 'program', 'broadcastAt'],
    description: 'Les émissions déjà diffusées, à revoir sur le site. Pour une vidéo YouTube, l’image est récupérée toute seule.',
    preview: (doc) => (doc.slug ? replayUrl(doc as { slug: string }) : null),
  },
  access: { read: airedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  defaultSort: '-broadcastAt',
  hooks: { ...revalidateHooks, beforeValidate: [youtubeThumbnail] },
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    { name: 'program', label: 'Émission', type: 'relationship', relationTo: 'programs', admin: { description: 'L’émission dont ce replay est un numéro (facultatif).' } },
    videoSourceField(),
    {
      name: 'thumbnail',
      label: 'Image de la vidéo',
      type: 'upload',
      relationTo: 'media',
      validate: thumbnailUnlessYoutube,
      admin: { description: 'Facultative pour une vidéo YouTube : son image est récupérée automatiquement à l’enregistrement.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'broadcastAt',
          label: 'Diffusé le',
          type: 'date',
          required: true,
          index: true,
          defaultValue: () => new Date().toISOString(),
          admin: { date: dateTimePicker(5), description: 'Le replay apparaît sur le site à partir de cette date.' },
        },
        { name: 'duration', label: 'Durée (facultatif)', type: 'text', admin: { placeholder: '52 min' } },
      ],
    },
    { name: 'description', label: 'Description', type: 'textarea' },
    slugField(),
  ],
}
