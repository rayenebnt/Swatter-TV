'use client'

import { agoLabel, feedLabel } from './time'
import { useNow } from './useNow'

/**
 * Date d'un article. Rendu serveur et hydratation : `initial` (texte calculé côté serveur, toujours exact) ;
 * après montage : « Il y a 3 h » (`ago`) ou l'heure / « Hier » / le jour (`feed`, fil « En continu »).
 */
export function RelativeTime({ iso, initial, clock, full, mode = 'ago' }: { iso: string; initial: string; clock?: string; full?: string; mode?: 'ago' | 'feed' }) {
  const now = useNow()
  const text = now === null ? initial : mode === 'feed' ? feedLabel(iso, clock ?? initial, now) : agoLabel(iso, now)
  return (
    <time dateTime={iso} title={full}>
      {text}
    </time>
  )
}
