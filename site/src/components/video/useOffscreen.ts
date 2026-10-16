'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Vrai quand l'élément est hors écran (pour mettre en pause ses animations CSS en boucle). */
export function useOffscreen(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [offscreen, setOffscreen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { rootMargin: '100px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, enabled])
  return enabled && offscreen
}
