'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Section dont les animations CSS sont mises en pause hors écran (classe is-paused).
 * Rendue en pause côté serveur : l'animation ne démarre qu'une fois la section visible.
 */
export function OffscreenPause({ className, labelledBy, children }: { className: string; labelledBy?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([en]) => el.classList.toggle('is-paused', !en.isIntersecting), { rootMargin: '100px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section ref={ref} className={`${className} is-paused`} aria-labelledby={labelledBy} data-reveal>
      {children}
    </section>
  )
}
