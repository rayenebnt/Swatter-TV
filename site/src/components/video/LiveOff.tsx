import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { MediaImage } from '@/components/ui/MediaImage'
import { formatDayLong, formatTime, parisDay } from '@/lib/format'
import type { MediaRef } from '@/lib/media'
import type { Slot } from '@/lib/queries/schedule'
import '@/styles/video.css'

const DAY_MS = 24 * 60 * 60 * 1000

/** « aujourd'hui », « demain » ou « le samedi 17 octobre » (heure de Paris). */
function dayLabel(iso: string, now: number) {
  const day = parisDay(iso)
  if (day === parisDay(new Date(now))) return 'aujourd’hui'
  if (day === parisDay(new Date(now + DAY_MS))) return 'demain'
  return `le ${formatDayLong(iso)}`
}

/** Direct coupé ou flux absent (composant serveur) : message d'attente, prochaine émission et lien vers la grille. */
export function LiveOff({ poster, next, now, fallbackSrc }: { poster: MediaRef; next: Slot | null; now: number; fallbackSrc: string }) {
  return (
    <div className="vp vp--off direct-off">
      <MediaImage media={poster} size="hero" fill sizes="(max-width: 1100px) 100vw, 900px" alt="" className="vp__poster" fallbackSrc={fallbackSrc} priority />
      <div className="vp__overlay">
        <Icon name="tv" className="vp__off-ico" />
        <h2>Le direct reprend bientôt</h2>
        {next ? (
          <p>
            Prochaine émission&nbsp;: <b>{next.title}</b>, {dayLabel(next.start, now)} à <time dateTime={next.start}>{formatTime(next.start)}</time>.
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
