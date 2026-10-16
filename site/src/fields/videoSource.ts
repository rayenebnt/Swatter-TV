import type { Field } from 'payload'

export type VideoProvider = 'youtube' | 'bunny' | 'url' | 'upload'

/**
 * Source d'une vidéo : lien YouTube, vidéo Bunny Stream, lien direct (MP4 / HLS .m3u8)
 * ou fichier envoyé dans la médiathèque.
 */
export const videoSourceField = (name = 'source', label = 'Vidéo', required = true): Field => ({
  name,
  label,
  type: 'group',
  fields: [
    {
      name: 'provider',
      label: 'Type de source',
      type: 'select',
      required,
      defaultValue: 'youtube',
      options: [
        { label: 'YouTube (lien de la vidéo)', value: 'youtube' },
        { label: 'Bunny Stream (identifiant)', value: 'bunny' },
        { label: 'Lien direct (MP4 ou flux HLS .m3u8)', value: 'url' },
        { label: 'Fichier envoyé', value: 'upload' },
      ],
    },
    {
      name: 'youtubeUrl',
      label: 'Lien YouTube',
      type: 'text',
      admin: { condition: (_, s) => s?.provider === 'youtube', placeholder: 'https://www.youtube.com/watch?v=…' },
    },
    {
      name: 'bunnyVideoId',
      label: 'Identifiant Bunny Stream',
      type: 'text',
      admin: { condition: (_, s) => s?.provider === 'bunny', description: 'Visible dans Bunny Stream > votre vidéo.' },
    },
    {
      name: 'url',
      label: 'Lien de la vidéo ou du flux',
      type: 'text',
      admin: { condition: (_, s) => s?.provider === 'url', placeholder: 'https://…/playlist.m3u8' },
    },
    {
      name: 'file',
      label: 'Fichier vidéo',
      type: 'upload',
      relationTo: 'media',
      admin: { condition: (_, s) => s?.provider === 'upload' },
    },
  ],
})
