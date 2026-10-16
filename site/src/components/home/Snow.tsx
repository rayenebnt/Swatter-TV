'use client'

import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from './useMotion'

type Flake = { x: number; y: number; r: number; s: number; d: number; o: number }

const MAX_FLAKES = 90
const AREA_PER_FLAKE = 16_000

/**
 * Neige légère sur le héros (canvas) : densité faible, résolution plafonnée à 1,5,
 * en pause hors écran et onglet masqué, absente si l'utilisateur préfère réduire les animations.
 */
export function Snow() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return

    let flakes: Flake[] = []
    let w = 0
    let h = 0
    let raf = 0
    let last = 0
    let visible = false

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = cv.clientWidth
      h = cv.clientHeight
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(Math.min(MAX_FLAKES, (w * h) / AREA_PER_FLAKE))
      flakes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.8 + 0.4,
        s: Math.random() * 0.5 + 0.25,
        d: Math.random() * Math.PI * 2,
        o: Math.random() * 0.5 + 0.2,
      }))
    }

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(50, t - (last || t))
      last = t
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#fff'
      for (const f of flakes) {
        f.y += f.s * dt * 0.045
        f.d += dt * 0.0012
        f.x += Math.sin(f.d) * 0.25
        if (f.y > h + 4) {
          f.y = -4
          f.x = Math.random() * w
        }
        ctx.globalAlpha = f.o
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const start = () => {
      if (raf || !visible || document.hidden) return
      if (!w) size()
      last = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting
        if (visible) start()
        else stop()
      },
      { threshold: 0.15 },
    )
    io.observe(cv)

    const onVisibility = () => (document.hidden ? stop() : start())
    // Redimensionnement : seulement si la taille du canvas change vraiment (la barre d'adresse mobile ne compte pas)
    let resizeTimer = 0
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (w && (cv.clientWidth !== w || cv.clientHeight !== h)) size()
      }, 150)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize, { passive: true })

    return () => {
      stop()
      io.disconnect()
      clearTimeout(resizeTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={ref} className="hero__snow" aria-hidden="true" />
}
