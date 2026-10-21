// Outils des webcams (rendu serveur) : vignette de repli et données sérialisables pour les composants client.
import { mediaAlt, mediaSize, mediaUrl } from '@/lib/media'
import type { WebcamItem } from '@/lib/queries/webcams'
import type { WebcamPoster } from './WebcamPlayer'
import type { WebcamView } from './WebcamTile'

const VISUALS = ['t-matin-a', 't-crepuscule-a', 't-ete-a', 't-hiver-b', 't-hiver-a', 't-nuages-a']

/** Durées du panoramique lent des cartes (décalées pour que les vignettes ne bougent pas ensemble). */
const PAN = ['24s', '28s', '20s', '26s']
export const panDuration = (i: number) => PAN[i % PAN.length]

/** Vignette de la webcam (taille « card » de Payload), sinon un visuel de la maquette. */
export function webcamPoster(w: WebcamItem): WebcamPoster {
  const src = mediaUrl(w.image, 'card')
  if (!src) return { src: `/visuels/${VISUALS[w.id % VISUALS.length]}.webp`, width: 960, height: 540, alt: '' }
  const { width, height } = mediaSize(w.image, 'card')
  return { src, width, height, alt: mediaAlt(w.image, `Webcam ${w.name}`) }
}

/** Webcam dont le lien du flux n'est pas encore renseigné : affichée « Bientôt en direct ». */
export const isComingSoon = (w: Pick<WebcamItem, 'embedUrl'>) => !w.embedUrl?.trim()

/** Données transmises au lecteur (uniquement des valeurs simples). */
export function toWebcamView(w: WebcamItem): WebcamView {
  return {
    id: w.id,
    slug: w.slug || `webcam-${w.id}`,
    name: w.name,
    place: w.place?.trim() || null,
    provider: w.provider,
    embedUrl: w.embedUrl?.trim() || null,
    temperature: w.temperature?.trim() || null,
    poster: webcamPoster(w),
  }
}
