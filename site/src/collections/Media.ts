import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'
import { purgeReplacedVideoMedia } from '@/hooks/videoAutoMedia'

/** « lac-annecy_matin-2.jpg » → « Lac annecy matin 2 » : description de secours tirée du nom du fichier. */
const altFromFilename = (filename: string) => {
  const words = filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_.]+/g, ' ')
    .trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médiathèque' },
  admin: {
    description:
      'Toutes les images et vidéos envoyées sur le site. Une image ajoutée depuis une fiche (vidéo, article…) arrive aussi ici. Point focal\u00a0: ouvrez l’image, cliquez sur « Modifier l’image » puis « Point focal » et cliquez sur le sujet ; il restera visible sur téléphone, où les images sont recadrées.',
  },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  hooks: {
    // Description laissée vide : on reprend le nom du fichier plutôt que de bloquer l'envoi
    beforeChange: [
      ({ data, originalDoc }) => {
        if (typeof data.alt === 'string' && data.alt.trim()) return data
        const filename = data.filename ?? originalDoc?.filename
        return typeof filename === 'string' ? { ...data, alt: altFromFilename(filename) || null } : data
      },
    ],
    // fichier vidéo remplacé : couverture et aperçu tirés de l'ancien fichier supprimés (refaits à l'enregistrement des fiches)
    afterChange: [purgeReplacedVideoMedia],
  },
  fields: [
    {
      name: 'alt',
      label: 'Description de l’image',
      type: 'text',
      admin: {
        description: 'Une courte phrase qui décrit l’image, par ex. « Le lac d’Annecy au lever du soleil ». Utile à Google et aux personnes malvoyantes.',
      },
    },
    { name: 'credit', label: 'Crédit photo (facultatif)', type: 'text', admin: { placeholder: '© Swatter TV Info' } },
  ],
  upload: {
    // dossier des fichiers envoyés ; MEDIA_DIR : un autre dossier (tests automatiques, pour ne pas toucher à media/)
    staticDir: process.env.MEDIA_DIR || 'media',
    // Images matricielles et vidéos uniquement (pas de SVG, qui peut contenir du script)
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm'],
    focalPoint: true,
    formatOptions: { format: 'webp', options: { quality: 82 } },
    imageSizes: [
      { name: 'thumb', width: 480, height: 270, position: 'centre', formatOptions: { format: 'webp', options: { quality: 78 } } },
      { name: 'card', width: 960, height: 540, position: 'centre', formatOptions: { format: 'webp', options: { quality: 80 } } },
      { name: 'poster', width: 600, height: 900, position: 'centre', formatOptions: { format: 'webp', options: { quality: 80 } } },
      { name: 'hero', width: 2400, height: undefined, formatOptions: { format: 'webp', options: { quality: 80 } } },
      // Aperçu des liens partagés (Facebook, WhatsApp, LinkedIn…) : JPEG, lu partout, contrairement au WebP ;
      // toujours généré, même à partir d'une petite image (agrandie), pour que chaque page ait son aperçu
      { name: 'og', width: 1200, height: 630, position: 'centre', withoutEnlargement: false, formatOptions: { format: 'jpeg', options: { quality: 80, mozjpeg: true } } },
    ],
    adminThumbnail: 'thumb',
  },
}
