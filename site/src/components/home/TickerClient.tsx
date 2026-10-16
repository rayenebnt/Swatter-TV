'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { formatTime } from '@/lib/format'

/** Bandeau du flash info : défilement mis en pause hors écran (le survol et le focus sont gérés en CSS). */
export function TickerFrame({ duration, children }: { duration: number; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [offscreen, setOffscreen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([en]) => setOffscreen(!en.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section
      ref={ref}
      className={offscreen ? 'ticker is-paused' : 'ticker'}
      aria-label="Flash info"
      style={{ '--ticker-dur': `${duration}s` } as CSSProperties}
    >
      {children}
    </section>
  )
}

/** Horloge « hh:mm » à l'heure de Paris : « --:-- » au rendu serveur, puis mise à jour à chaque minute. */
export function TickerClock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    let timer = 0
    const tick = () => {
      clearTimeout(timer)
      if (document.hidden) return
      setTime(formatTime(new Date()))
      // Prochaine mise à jour au changement de minute
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    }
    const raf = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return (
    <span className="ticker__clock" aria-hidden="true">
      {time ?? '--:--'}
    </span>
  )
}
