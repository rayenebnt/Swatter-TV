'use client'

import { useEffect, useState, type CSSProperties } from 'react'

/** Créneau du direct, sérialisable (horaires déjà formatés en heure de Paris côté serveur). */
export type LiveSlot = { title: string; start: string; end: string; startLabel: string; endLabel: string }

const REFRESH_MS = 30_000

function remainingLabel(minutes: number): string {
  if (minutes < 60) return `Il reste ${Math.max(1, minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `Il reste ${h} h ${String(m).padStart(2, '0')}` : `Il reste ${h} h`
}

/**
 * Programme en cours sur la diapositive « direct » : titre, horaires et barre de progression.
 * Au rendu serveur (et à l'hydratation) la barre est vide ; la progression est calculée après montage,
 * puis toutes les 30 s (et au retour sur l'onglet). Passe au créneau suivant quand le programme se termine.
 */
export function LiveProgress({
  slots,
  current,
  showTitle,
  className,
  style,
}: {
  /** slots[0] : programme en cours au moment du rendu serveur (si `current`), puis les suivants */
  slots: LiveSlot[]
  current: boolean
  showTitle: boolean
  className?: string
  style?: CSSProperties
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(Date.now())
    }
    // Première mesure à l'image suivante : la barre s'anime depuis zéro, comme dans la maquette
    const raf = requestAnimationFrame(update)
    const timer = window.setInterval(update, REFRESH_MS)
    document.addEventListener('visibilitychange', update)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  const slot =
    now === null ? (current ? slots[0] : undefined) : slots.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end))
  if (!slot) return null

  const start = Date.parse(slot.start)
  const end = Date.parse(slot.end)
  const ratio = now === null || end <= start ? 0 : Math.min(1, Math.max(0, (now - start) / (end - start)))
  const remaining = now === null ? null : remainingLabel(Math.ceil((end - now) / 60_000))
  // Le titre est déjà celui de la diapositive par défaut ; on l'affiche dès que le programme a changé
  const withTitle = showTitle || slot !== slots[0]

  return (
    <div className={className ? `progress ${className}` : 'progress'} style={style}>
      {withTitle && (
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
        aria-valuenow={now === null ? undefined : Math.round(ratio * 100)}
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
