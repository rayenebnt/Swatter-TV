import type { Field } from 'payload'
import { twitchTarget } from '@/lib/video'

export type VideoProvider = 'youtube' | 'twitch' | 'bunny' | 'url' | 'upload'

/**
 * Source d'une vidéo : lien YouTube, vidéo Bunny Stream, lien direct (MP4 / HLS .m3u8)
 * ou fichier envoyé dans la médiathèque ; `twitch` ajoute une chaîne Twitch (pour le direct).
 */
export const videoSourceField = (name = 'source', label = 'Vidéo', required = true, { twitch = false } = {}): Field => ({
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
        ...(twitch ? [{ label: 'Sur Twitch', value: 'twitch' }] : []),
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
    ...(twitch
      ? [
          {
            name: 'twitchUrl',
            label: 'Lien de la chaîne Twitch',
            type: 'text',
            validate: (value: unknown, { siblingData }: { siblingData: Partial<Record<string, unknown>> }) =>
              siblingData?.provider !== 'twitch' || twitchTarget(typeof value === 'string' ? value : null)
                ? true
                : 'Collez l’adresse de la chaîne Twitch, par exemple https://www.twitch.tv/swattertv',
            admin: {
              condition: (_, s) => s?.provider === 'twitch',
              placeholder: 'https://www.twitch.tv/…',
              description: 'L’adresse de la chaîne, copiée depuis la barre d’adresse du navigateur sur Twitch (le nom de la chaîne seul suffit aussi).',
            },
          } satisfies Field,
        ]
      : []),
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
      filterOptions: { mimeType: { contains: 'video/' } },
      admin: { condition: (_, s) => s?.provider === 'upload', description: 'MP4 conseillé. Pour les vidéos longues, préférez YouTube ou Bunny Stream.' },
    },
  ],
})
