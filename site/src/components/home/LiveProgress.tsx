'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { ON_AIR_UNTIL_END } from '@/lib/on-air'
import type { LiveLine } from './liveSlide'

/** Créneau du direct, sérialisable (horaires déjà formatés en heure de Paris côté serveur, après rognage à l'antenne). */
export type LiveSlot = {
  title: string
  start: string
  end: string
  startLabel: string
  endLabel: string
  /** Diapositive par défaut : genre et résumé du programme en cours */
  genreLabel?: string
  synopsis?: string | null
}

function remainingLabel(minutes: number): string {
  if (minutes < 60) return `Il reste ${Math.max(1, minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `Il reste ${h} h ${String(m).padStart(2, '0')}` : `Il reste ${h} h`
}

/**
 * Ligne de la diapositive « direct » (voir liveView) :
 * - à l'antenne, programme en cours : titre, horaires et barre de progression. Au rendu serveur (et à l'hydratation) la
 *   barre est vide ; la progression est mesurée à l'image suivante (la barre s'anime depuis zéro), puis suit `now`
 *   (horloge partagée useNow, toutes les 15 s et au retour sur l'onglet) ;
 * - à l'antenne sans programme saisi : « À l'antenne jusqu'à 0 h 30 », sans barre ;
 * - hors antenne : « Ce soir à 18:00 · Le journal » (ou « Reprise ce soir à 18 h » sans grille).
 */
export function LiveProgress({ line, now, className, style }: { line: LiveLine; now: number | null; className?: string; style?: CSSProperties }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const cls = (extra = '') => `progress${extra}${className ? ` ${className}` : ''}`
  if (line.kind === 'until') {
    return (
      <div className={cls(' progress--line')} style={style}>
        <p className="progress__now">
          <b>{ON_AIR_UNTIL_END}</b>
        </p>
      </div>
    )
  }
  if (line.kind === 'off') {
    return (
      <div className={cls(' progress--line')} style={style} data-onair="hors-antenne">
        <p className="progress__now">
          {line.title ? (
            <>
              <span>{line.label} ·</span>
              <b>{line.title}</b>
            </>
          ) : (
            <b>{line.label}</b>
          )}
        </p>
      </div>
    )
  }

  const { slot, showTitle } = line
  const t = ready ? now : null
  const start = Date.parse(slot.start)
  const end = Date.parse(slot.end)
  const ratio = t === null || end <= start ? 0 : Math.min(1, Math.max(0, (t - start) / (end - start)))
  const remaining = t === null ? null : remainingLabel(Math.ceil((end - t) / 60_000))

  return (
    <div className={cls()} style={style}>
      {showTitle && (
        <p className="progress__now">
          <span>À l’antenne</span>
          <b>{slot.title}</b>
        </p>
      )}
      <div
        className="progress__bar"
        role="progressbar"
        aria-label={`Progression du programme en cours : ${slot.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={t === null ? undefined : Math.round(ratio * 100)}
        aria-valuetext={remaining ?? undefined}
      >
        <span style={{ '--p': ratio.toFixed(4) } as CSSProperties} />
      </div>
      <div className="progress__lbl">
        <span>{slot.startLabel}</span>
        <span>{remaining ?? ' '}</span>
        <span>{slot.endLabel}</span>
      </div>
    </div>
  )
}
