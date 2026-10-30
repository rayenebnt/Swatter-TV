// Fichier inséré dans un texte riche (bloc « Upload » de l'éditeur Lexical) : ce qu'il faut afficher, sans React.
import type { SerializedUploadNode } from '@payloadcms/richtext-lexical'
import { mediaAlt, mediaUrl } from '@/lib/media'
import type { Media } from '@/payload-types'

/** Largeur affichée d'une image du texte (attribut sizes) : toute la largeur moins les marges sur téléphone, sinon la colonne (.prose : 72ch, 772 px). */
export const PROSE_SIZES = '(max-width: 760px) calc(100vw - 32px), 780px'

export type ProseUpload =
  | { kind: 'image'; media: Media; alt: string; credit: string | null }
  | { kind: 'video'; media: Media; src: string; label: string }
  | { kind: 'file'; src: string; name: string }

/** Fichier de la médiathèque inséré dans le texte : image, vidéo ou autre fichier (lien) ; rien si le média n'est pas chargé. */
export function proseUpload(node: Pick<SerializedUploadNode, 'relationTo' | 'value' | 'fields'>): ProseUpload | null {
  if (node.relationTo !== 'media' || typeof node.value !== 'object' || node.value === null) return null
  const media = node.value as Media
  const src = mediaUrl(media)
  if (!src) return null
  const mime = media.mimeType ?? ''
  // Texte alternatif saisi dans le bloc, sinon la description du média
  const fieldAlt = typeof node.fields?.alt === 'string' ? node.fields.alt.trim() : ''
  if (mime.startsWith('image/')) {
    const credit = media.credit?.trim().replace(/^©\s*/, '') || null
    return { kind: 'image', media, alt: fieldAlt || mediaAlt(media), credit }
  }
  if (mime.startsWith('video/')) return { kind: 'video', media, src, label: fieldAlt || mediaAlt(media, 'Vidéo') }
  return { kind: 'file', src, name: media.filename || 'Télécharger le fichier' }
}
