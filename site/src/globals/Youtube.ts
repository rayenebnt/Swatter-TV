import type { GlobalConfig } from 'payload'
import { authenticated } from '@/access'
import { dateTimePicker } from '@/fields/date'
import { VIDEO_CATEGORIES } from '@/lib/categories'
import { parseChannel } from '@/lib/import/youtube'

/**
 * Chaîne YouTube de Swatter TV : ses vidéos arrivent toutes seules dans « Vidéos » (voir src/lib/import/youtube.ts).
 * Les champs masqués sont tenus à jour par l'import.
 */
export const Youtube: GlobalConfig = {
  slug: 'youtube',
  label: 'Chaîne YouTube',
  admin: {
    description:
      'Les vidéos publiées sur la chaîne YouTube arrivent toutes seules dans « Vidéos », toutes les heures. Une vidéo supprimée du site ne revient pas.',
  },
  access: { read: authenticated, update: authenticated },
  fields: [
    {
      name: 'channel',
      label: 'Adresse de la chaîne YouTube',
      type: 'text',
      validate: (value: unknown) =>
        !value || parseChannel(typeof value === 'string' ? value : null) ? true : 'Collez l’adresse de la chaîne, par exemple https://www.youtube.com/@swattertv',
      admin: {
        placeholder: 'https://www.youtube.com/@…',
        description: 'Sur YouTube, ouvrez la page de la chaîne et copiez l’adresse affichée dans la barre du navigateur.',
      },
    },
    { name: 'autoImport', label: 'Importer automatiquement les nouvelles vidéos (toutes les heures)', type: 'checkbox', defaultValue: true },
    {
      type: 'row',
      fields: [
        {
          name: 'publishMode',
          label: 'Les vidéos importées sont…',
          type: 'select',
          required: true,
          defaultValue: 'published',
          options: [
            { label: 'En ligne aussitôt', value: 'published' },
            { label: 'En brouillon (à publier soi-même)', value: 'draft' },
          ],
        },
        { name: 'category', label: 'Catégorie donnée aux vidéos importées', type: 'select', required: true, defaultValue: 'divertissement', options: [...VIDEO_CATEGORIES] },
      ],
    },
    { name: 'importStatus', type: 'ui', admin: { components: { Field: '/components/admin/YoutubeImport#YoutubeImport' } } },
    { name: 'lastImportAt', label: 'Dernier import', type: 'date', admin: { readOnly: true, hidden: true, date: dateTimePicker() } },
    { name: 'lastResult', label: 'Résultat du dernier import', type: 'text', admin: { readOnly: true, hidden: true } },
    { name: 'lastError', label: 'Dernière erreur', type: 'text', admin: { readOnly: true, hidden: true } },
    // identifiant UC… de la chaîne, et l'adresse dont il a été déduit (recalculé si l'adresse change)
    { name: 'channelId', type: 'text', admin: { readOnly: true, hidden: true } },
    { name: 'channelFrom', type: 'text', admin: { readOnly: true, hidden: true } },
    // vidéos déjà importées une fois (identifiants YouTube) : jamais réimportées, même supprimées du site
    { name: 'importedIds', type: 'json', admin: { readOnly: true, hidden: true } },
  ],
}
