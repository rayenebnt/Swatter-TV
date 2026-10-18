import type { CollectionBeforeValidateHook } from 'payload'
import { youtubeId } from '@/lib/video'

/** Adresse des images YouTube (remplaçable pour les tests, sans accès à Internet). */
const thumbBase = () => (process.env.YOUTUBE_THUMB_BASE || 'https://i.ytimg.com/vi').replace(/\/+$/, '')

/** Image la plus grande disponible : « maxresdefault » n'existe que pour les vidéos en HD. */
async function downloadThumbnail(id: string): Promise<Buffer | null> {
  for (const name of ['maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg']) {
    try {
      const res = await fetch(`${thumbBase()}/${id}/${name}`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const file = Buffer.from(await res.arrayBuffer())
      // une image minuscule est l'image grise « indisponible » de YouTube
      if (file.length > 2000) return file
    } catch {
      // YouTube injoignable ou trop lent : on essaie la taille suivante
    }
  }
  return null
}

/**
 * Vidéo ou replay YouTube enregistré sans image : l'image de la vidéo est téléchargée dans la médiathèque
 * et utilisée comme vignette. En cas d'échec (YouTube injoignable), le site affiche un visuel de remplacement.
 */
export const youtubeThumbnail: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data
  const thumbnail = data.thumbnail === undefined ? originalDoc?.thumbnail : data.thumbnail
  const source = (data.source ?? originalDoc?.source) as { provider?: string; youtubeUrl?: string } | undefined
  if (thumbnail || source?.provider !== 'youtube' || !source.youtubeUrl) return data
  const id = youtubeId(source.youtubeUrl)
  if (!id) return data

  // Image déjà téléchargée pour cette vidéo (même vidéo en replay et dans « Vidéos », vignette retirée puis remise…) ;
  // « like » est approximatif (le « _ » d'un identifiant YouTube y est un joker) : le nom exact est vérifié ensuite
  const sameVideo = new RegExp(`^youtube-${id}(-\\d+)?\\.\\w+$`)
  const candidates = await req.payload.find({ collection: 'media', where: { filename: { like: `youtube-${id}` } }, limit: 10, depth: 0, req })
  const existing = candidates.docs.find((m) => typeof m.filename === 'string' && sameVideo.test(m.filename))
  if (existing) return { ...data, thumbnail: existing.id }

  const file = await downloadThumbnail(id)
  if (!file) {
    req.payload.logger.warn(`[swatter] Image YouTube introuvable pour la vidéo ${id}`)
    return data
  }
  const title = String(data.title ?? originalDoc?.title ?? '').trim()
  const media = await req.payload.create({
    collection: 'media',
    data: { alt: title || 'Image de la vidéo', credit: 'YouTube' },
    file: { data: file, mimetype: 'image/jpeg', name: `youtube-${id}.jpg`, size: file.length },
    req,
  })
  return { ...data, thumbnail: media.id }
}

/** Vignette obligatoire, sauf pour une vidéo YouTube (récupérée automatiquement). */
export const thumbnailUnlessYoutube = (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
  const provider = (siblingData?.source as { provider?: string } | undefined)?.provider
  return value || provider === 'youtube' ? true : 'Ajoutez une image : elle est obligatoire, sauf pour une vidéo YouTube.'
}
