'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Grille de webcams : animations en boucle (panoramique, pastille « En direct ») en pause hors écran et onglet caché. */
export function CamsGrid({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let onScreen = true
    const update = () => setPaused(!onScreen || document.hidden)
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        update()
      },
      { rootMargin: '100px 0px' },
    )
    io.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return (
    <div ref={ref} className={paused ? `${className} is-paused` : className}>
      {children}
    </div>
  )
}
