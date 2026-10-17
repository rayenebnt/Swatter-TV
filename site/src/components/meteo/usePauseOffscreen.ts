'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Met en pause les animations des icônes météo (attribut `data-paused`, voir meteo.css)
 * quand l'élément est hors écran ou que l'onglet est caché.
 */
export function usePauseOffscreen(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let visible = false
    const update = () => el.toggleAttribute('data-paused', !visible || document.hidden)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      update()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', update)
      el.removeAttribute('data-paused')
    }
  }, [ref])
}
