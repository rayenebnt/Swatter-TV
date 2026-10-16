'use client'

import { useEffect, useRef, useState } from 'react'
import { formatNumber } from '@/lib/format'
import { prefersReducedMotion } from './useMotion'

const DURATION = 1800

/**
 * Compteur animé (0 → valeur) lancé à sa première apparition à l'écran.
 * `children` : valeur finale déjà formatée côté serveur (lue par les moteurs de recherche et sans JavaScript).
 */
export function CountUp({ value, children }: { value: number; children: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || value <= 0 || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return
    let raf = 0
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / DURATION)
        setShown(k < 1 ? Math.round(value * (1 - Math.pow(1 - k, 3))) : null)
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])

  return <span ref={ref}>{shown === null ? children : formatNumber(shown)}</span>
}
