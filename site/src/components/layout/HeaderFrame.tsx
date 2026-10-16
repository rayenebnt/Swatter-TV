'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Cadre de l'en-tête : barre de lecture dorée + <header> fixe.
 * - plein (is-solid) après 40 px de défilement ;
 * - masqué en descendant au-delà de 700 px, réaffiché en remontant ou dès qu'il reçoit le focus.
 * Les classes sont posées directement sur le DOM (aucun nouveau rendu React pendant le défilement).
 */
export function HeaderFrame({ children }: { children: ReactNode }) {
  const hdr = useRef<HTMLElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = hdr.current
    const rb = bar.current
    if (!el || !rb) return
    let lastY = window.scrollY
    let raf = 0
    const update = () => {
      raf = 0
      const y = Math.max(0, window.scrollY)
      const max = document.documentElement.scrollHeight - window.innerHeight
      el.classList.toggle('is-solid', y > 40)
      if (y > 700 && y > lastY + 4) el.classList.add('is-hidden')
      else if (y < lastY - 4 || y <= 700) el.classList.remove('is-hidden')
      lastY = y
      rb.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const onFocus = () => el.classList.remove('is-hidden')
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    el.addEventListener('focusin', onFocus)
    // La hauteur de la page change (navigation, contenus chargés) : la barre de lecture suit
    const ro = new ResizeObserver(schedule)
    ro.observe(document.body)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      el.removeEventListener('focusin', onFocus)
      ro.disconnect()
    }
  }, [])

  return (
    <>
      <div ref={bar} className="readbar" aria-hidden="true" />
      <header ref={hdr} className="hdr">
        {children}
      </header>
    </>
  )
}
