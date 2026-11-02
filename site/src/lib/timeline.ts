// Frise chronologique d'une page éditoriale (« Le groupe » : l'évolution du logo) : étapes affichables, logique pure
// (testée en unitaire). Rendu : src/components/ui/Timeline.tsx ; champ : collection Pages (« Frise chronologique »).
import type { Page } from '@/payload-types'
import { mediaAlt, mediaSize, mediaUrl } from './media'

export type TimelineStep = {
  key: string
  date: string | null
  title: string
  text: string | null
  image: { src: string; alt: string; width: number; height: number }
}

/** Titre de la frise quand il n'est pas renseigné. */
export const DEFAULT_TIMELINE_TITLE = 'Notre histoire'

/**
 * Étapes affichables, dans l'ordre saisi (de la plus ancienne à la plus récente) : avec un titre et une image lisible
 * (fichier de la médiathèque, relation chargée). Une étape incomplète (image supprimée depuis, titre vide d'un brouillon)
 * est ignorée. Image : fichier d'origine (les tailles de la médiathèque sont recadrées en 16:9, un logo serait coupé),
 * description de la médiathèque, sinon le titre de l'étape.
 */
export function timelineSteps(timeline: Page['timeline']): TimelineStep[] {
  return (timeline?.steps ?? []).flatMap((step, i) => {
    const title = step.title?.trim()
    const src = mediaUrl(step.image)
    if (!title || !src) return []
    const { width, height } = mediaSize(step.image)
    return [
      {
        key: step.id || `etape-${i}`,
        date: step.date?.trim() || null,
        title,
        text: step.text?.trim() || null,
        image: { src, alt: mediaAlt(step.image, title), width, height },
      },
    ]
  })
}
