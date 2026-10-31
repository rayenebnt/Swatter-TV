import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatTime } from '@/lib/format'
import { slotEvening, type OnAirState } from '@/lib/on-air'
import type { Slot } from '@/lib/queries/schedule'
import '@/styles/video.css'

/**
 * Écran de la page Direct quand le lecteur n'est pas affiché (rendu par DirectStage, dans le navigateur comme au serveur) :
 * - hors antenne (de 0 h 30 à 18 h) : « Le direct reprend ce soir à 18 h » et le premier programme de la soirée ;
 * - direct coupé dans les réglages, ou sans flux : « Le direct reprend bientôt » et la prochaine émission.
 * `poster` : image de fond rendue côté serveur (MediaImage).
 */
export function LiveOff({ poster, state, now, cut }: { poster: ReactNode; state: OnAirState<Slot>; now: number; cut: boolean }) {
  const next = state.upcoming[0] ?? null
  // direct coupé : la soirée est toujours précisée (« ce soir », « demain soir »…) ; hors antenne, « à 18:00 » suffit pour celle qui vient
  const evening = next ? slotEvening(next, state, now, cut) : null
  return (
    <div className="vp vp--off direct-off" data-onair={cut ? 'coupe' : 'hors-antenne'}>
      {poster}
      <div className="vp__overlay">
        <Icon name="tv" className="vp__off-ico" />
        <h2>{cut ? 'Le direct reprend bientôt' : 'Le direct reprend ce soir à 18 h'}</h2>
        {next ? (
          <p>
            {cut ? 'Prochaine émission' : 'Au programme'}&nbsp;: <b>{next.title}</b>
            {cut ? ', ' : ' '}
            {evening ? `${evening} à ` : 'à '}
            <time dateTime={next.start}>{formatTime(next.start)}</time>.
          </p>
        ) : (
          <p>En attendant, retrouvez nos émissions en replay et nos dernières vidéos.</p>
        )}
        <Link className="btn btn--gold btn--sm" href={next ? '/programme-tv' : '/replay'}>
          <Icon name={next ? 'cal' : 'replay'} />
          {next ? 'Voir le programme TV' : 'Voir le replay'}
        </Link>
      </div>
    </div>
  )
}
