import type { CollectionConfig } from 'payload'
import { anyone, authenticated } from '@/access'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médiathèque' },
  admin: { group: 'Contenus', description: 'Images et vidéos du site.' },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  fields: [
    { name: 'alt', label: 'Texte alternatif', type: 'text', required: true, admin: { description: 'Décrit l’image pour les personnes malvoyantes et pour Google.' } },
    { name: 'credit', label: 'Crédit', type: 'text' },
  ],
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'video/mp4', 'video/webm'],
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
