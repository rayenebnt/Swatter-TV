'use client'

import { useLayoutEffect, useRef } from 'react'
import { formatTemp } from '@/lib/meteo'

const DURATION = 700

/**
 * Température : valeur exacte au rendu serveur, puis comptage de 0 à la valeur quand elle apparaît à l'écran
 * (comme la maquette). Le texte est modifié directement sur son nœud : aucun rendu React par image.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const node = el?.firstChild
    if (!el || !node) return
    const show = (v: number) => {
      node.nodeValue = formatTemp(v)
    }
    show(value)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    show(0)
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const step = (now: number) => {
          const k = Math.min(1, (now - start) / DURATION)
          show(Math.round(value * (1 - (1 - k) ** 3)))
          if (k < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      show(value)
    }
  }, [value])

  return <span ref={ref}>{formatTemp(value)}</span>
}
