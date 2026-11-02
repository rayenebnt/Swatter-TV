// Vidéo de fond des diapositives du carrousel (rendu serveur de Hero.tsx) : version légère si elle est prête, sinon
// préparée en arrière-plan (src/hooks/videoAutoMedia.ts : un seul traitement par vidéo, pas de nouvel essai avant 10 min
// après un échec) et, en attendant, le fichier d'origine s'il est déjà léger (heroVideoSources). Module serveur uniquement.
import config from '@payload-config'
import { getPayload } from 'payload'
import { findBackgroundVideo, prepareBackgroundVideo } from '@/hooks/videoAutoMedia'
import type { MediaRef } from '@/lib/media'
import { heroVideoSources, type HeroVideoSource } from './heroMedia'

/** Sources de la vidéo de fond de la diapositive ; vide : image seule (pas de vidéo, ou pas encore lisible). */
export async function heroVideoSource(video: MediaRef): Promise<HeroVideoSource[]> {
  if (!video || typeof video !== 'object' || !video.mimeType?.startsWith('video/')) return []
  try {
    const payload = await getPayload({ config })
    const light = await findBackgroundVideo(payload, video.id)
    // version légère absente : préparée sans attendre (rendus suivants : la page en cache se met à jour d'elle-même)
    if (!light) void prepareBackgroundVideo(payload, video.id)
    return heroVideoSources(video, light)
  } catch {
    // base injoignable : le fichier d'origine s'il est léger, sinon l'image seule
    return heroVideoSources(video, null)
  }
}
