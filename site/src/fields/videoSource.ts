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
      label: 'Où se trouve la vidéo ?',
      type: 'select',
      required,
      defaultValue: 'youtube',
      options: [
        { label: 'Sur YouTube', value: 'youtube' },
        { label: 'Sur Bunny Stream', value: 'bunny' },
        { label: 'Lien direct vers un fichier MP4 ou un flux .m3u8', value: 'url' },
        { label: 'Fichier envoyé dans la médiathèque', value: 'upload' },
      ],
    },
    {
      name: 'youtubeUrl',
      label: 'Lien de la vidéo YouTube',
      type: 'text',
      admin: {
        condition: (_, s) => s?.provider === 'youtube',
        placeholder: 'https://www.youtube.com/watch?v=…',
        description: 'Sur YouTube, cliquez sur « Partager » sous la vidéo, copiez le lien et collez-le ici.',
      },
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
      admin: { condition: (_, s) => s?.provider === 'upload', description: 'MP4 conseillé. Pour les vidéos longues, préférez YouTube ou Bunny Stream.' },
    },
  ],
})
