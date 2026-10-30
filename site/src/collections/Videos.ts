import type { CollectionConfig } from 'payload'
import { authenticated, publishedOrAuthenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { draftVersions } from '@/fields/drafts'
import { slugField } from '@/fields/slug'
import { videoSourceField } from '@/fields/videoSource'
import { recordLiveBefore } from '@/hooks/live-before'
import { revalidateAfterChange, revalidateAfterDelete } from '@/hooks/revalidate'
import { top10AfterChange, top10AfterDelete } from '@/hooks/top10'
import { thumbnailUnlessYoutube, youtubeThumbnail } from '@/hooks/youtubeThumbnail'
import { VIDEO_CATEGORIES } from '@/lib/categories'
import { videoUrl } from '@/lib/urls'

export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: { singular: 'Vidéo', plural: 'Vidéos' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', 'isVideoOfDay', 'top10Rank'],
    description: 'Vidéo du jour, Top 10 et vidéos à la demande. Pour une vidéo YouTube, collez simplement son lien : l’image est récupérée toute seule.',
    preview: (doc) => (doc.slug ? videoUrl(doc as { slug: string }) : null),
  },
  access: { read: publishedOrAuthenticated, create: authenticated, update: authenticated, delete: authenticated },
  // brouillons enregistrés automatiquement, publiés au clic sur « Publier les modifications »
  versions: draftVersions,
  defaultSort: '-publishedAt',
  hooks: {
    beforeValidate: [youtubeThumbnail],
    // version en ligne avant l'enregistrement (place du Top 10 libérée, retrait du site) : voir src/hooks/live-before.ts
    beforeChange: [recordLiveBefore],
    // Top 10 sans doublon (les autres vidéos classées se décalent), puis régénération du site
    afterChange: [top10AfterChange, revalidateAfterChange],
    afterDelete: [top10AfterDelete, revalidateAfterDelete],
  },
  fields: [
    { name: 'title', label: 'Titre', type: 'text', required: true },
    videoSourceField(),
    {
      name: 'thumbnail',
      label: 'Image de la vidéo',
      type: 'upload',
      relationTo: 'media',
      validate: thumbnailUnlessYoutube,
      // images seulement : un MP4 choisi ici donnerait une vignette cassée
      filterOptions: { mimeType: { contains: 'image/' } },
      admin: { description: 'Facultative pour une vidéo YouTube : son image est récupérée automatiquement à l’enregistrement.' },
    },
    // aperçu animé (court extrait muet, MP4) généré automatiquement à partir de la vidéo : voir src/hooks
    { name: 'preview', label: 'Aperçu animé', type: 'upload', relationTo: 'media', admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        { name: 'category', label: 'Catégorie', type: 'select', required: true, options: [...VIDEO_CATEGORIES], defaultValue: 'divertissement' },
        { name: 'duration', label: 'Durée (facultatif)', type: 'text', admin: { placeholder: '02:14 ou 1:34:00' } },
      ],
    },
    { name: 'description', label: 'Description', type: 'textarea' },
    {
      name: 'publishedAt',
      label: 'Date de publication',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      admin: { position: 'sidebar', date: dateTimePicker(), description: 'Une date à venir programme la vidéo : elle apparaîtra toute seule ce jour-là.' },
    },
    { name: 'isVideoOfDay', label: 'Vidéo du jour', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Affichée en grand dans « À la une ». Si plusieurs vidéos sont cochées, la plus récente l’emporte.' } },
    {
      name: 'top10Rank',
      label: 'Place dans le Top 10',
      type: 'number',
      min: 1,
      max: 10,
      admin: {
        position: 'sidebar',
        description: '1 à 10. Si la place est prise, les vidéos suivantes descendent d’un cran. Laissez vide si la vidéo n’est pas dans le Top 10.',
      },
    },
    slugField(),
    // compteur repris de l'ancien site (affiché sur la page de la vidéo s'il est renseigné), sans intérêt dans le formulaire
    { name: 'views', label: 'Nombre de vues', type: 'number', defaultValue: 0, admin: { hidden: true } },
  ],
}
