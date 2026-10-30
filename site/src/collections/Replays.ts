import type { CollectionConfig } from 'payload'
import { airedOrAuthenticated, authenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { videoSourceField } from '@/fields/videoSource'
import { revalidateHooks } from '@/hooks/revalidate'
import { thumbnailUnlessAutomatic, videoAutoMedia } from '@/hooks/videoAutoMedia'
import { replayUrl } from '@/lib/urls'

export const Replays: CollectionConfig = {
  slug: 'replays',
  labels: { singular: 'Replay', plural: 'Replays' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'program', 'broadcastAt'],
    description:
      'Les émissions déjà diffusées, à revoir sur le site. Une image et un court aperçu animé sont tirés automatiquement de la vidéo à l’enregistrement ; choisissez une autre image si elle ne convient pas.',
    preview: (doc) => (doc.slug ? replayUrl(doc as { slug: string }) : null),
  },
  access: { read: airedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  defaultSort: '-broadcastAt',
  hooks: { ...revalidateHooks, beforeValidate: [videoAutoMedia] },
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    { name: 'program', label: 'Émission', type: 'relationship', relationTo: 'programs', admin: { description: 'L’émission dont ce replay est un numéro (facultatif).' } },
    videoSourceField(),
    {
      name: 'thumbnail',
      label: 'Image de la vidéo',
      type: 'upload',
      relationTo: 'media',
      validate: thumbnailUnlessAutomatic,
      // images seulement : un MP4 choisi ici donnerait une vignette cassée
      filterOptions: { mimeType: { contains: 'image/' } },
      admin: {
        description:
          'Une image est tirée automatiquement de la vidéo à l’enregistrement ; choisissez-en une autre ici si elle ne convient pas. Obligatoire seulement pour une vidéo Bunny Stream.',
      },
    },
    // aperçu animé (court extrait muet, MP4) généré automatiquement à partir de la vidéo : voir src/hooks/videoAutoMedia.ts
    { name: 'preview', label: 'Aperçu animé', type: 'upload', relationTo: 'media', admin: { hidden: true } },
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
