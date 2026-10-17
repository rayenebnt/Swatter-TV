'use client'

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { formatTemp } from '@/lib/meteo'
import type { ForecastDay } from '@/lib/meteo-types'
import { WeatherIcon } from './WeatherIcon'

type Hour = ForecastDay['hours'][number]
export type ChartVariant = 'aside' | 'full'
type Layout = { width: number; top: number; bottom: number; icons: number; labels: number; height: number; radius: number }

/** Gabarit en pixels CSS : largeur avant mesure, haut et bas du tracé, lignes des icônes et des heures, hauteur totale. */
const LAYOUT: Record<ChartVariant, Layout> = {
  aside: { width: 356, top: 16, bottom: 70, icons: 0, labels: 88, height: 96, radius: 3.2 },
  full: { width: 690, top: 28, bottom: 150, icons: 162, labels: 206, height: 214, radius: 4 },
}
const PAD = 8 // marge latérale pour les étiquettes des extrémités
const round = (n: number) => Math.round(n * 10) / 10
const vars = (v: Record<string, number>) => v as CSSProperties

type Pt = readonly [number, number]

/** Longueur approchée d'une courbe de Bézier cubique (longueur du trait animé). */
function bezierLength(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  let len = 0
  let prev = p0
  for (let i = 1; i <= 12; i++) {
    const t = i / 12
    const u = 1 - t
    const pt: Pt = [
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ]
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1])
    prev = pt
  }
  return len
}

/** Points et tracés (Catmull-Rom → Bézier, comme la maquette) pour une largeur donnée. */
function geometry(hours: Hour[], width: number, l: Layout) {
  const w = Math.max(160, width - PAD * 2)
  const temps = hours.map((h) => h.temp)
  const lo = Math.min(...temps) - 2
  const hi = Math.max(...temps) + 2
  // courbe parfaitement plate : léger décalage, sinon le dégradé du trait (boîte de hauteur nulle) ne s'affiche pas
  const flat = hi - lo <= 4
  const pts: Pt[] = hours.map((h, i) => [(i * w) / (hours.length - 1), l.top + (1 - (h.temp - lo) / (hi - lo)) * (l.bottom - l.top) + (flat && i === 0 ? 0.4 : 0)])
  let line = `M${round(pts[0][0])} ${round(pts[0][1])}`
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    line += ` C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p2[0])} ${round(p2[1])}`
    len += bezierLength(p1, c1, c2, p2)
  }
  return { w, pts, line, area: `${line} L${round(w)} ${l.bottom} L0 ${l.bottom}Z`, len: Math.ceil(len) + 4 }
}

/**
 * Courbe des températures horaires (tracé animé, points, valeurs, heures ; icônes horaires en version large).
 * La largeur mesurée est gardée par le parent (`width` / `onWidth`) pour ne pas « sauter » au changement de jour.
 */
export function MeteoChart({
  hours,
  city,
  variant,
  width,
  onWidth,
}: {
  hours: Hour[]
  city: string
  variant: ChartVariant
  width: number | null
  onWidth: (width: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const l = LAYOUT[variant]

  // 1 unité du SVG = 1 pixel CSS : textes nets et proportions constantes à toutes les largeurs
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0)
      if (w > 0) onWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [onWidth])

  // Courbe montée hors écran : son animation attend qu'elle apparaisse (attribut data-wait, voir meteo.css)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = el.getBoundingClientRect()
    if (box.bottom > 0 && box.top < window.innerHeight) return
    el.setAttribute('data-wait', '')
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        el.removeAttribute('data-wait')
        io.disconnect()
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      el.removeAttribute('data-wait')
    }
  }, [])

  if (hours.length < 2) return null
  const g = geometry(hours, width ?? l.width, l)
  const label = `Températures à ${city} : ${hours.map((h) => `${formatTemp(h.temp)} à ${h.hour} h`).join(', ')}`

  return (
    <div ref={ref} className={`chart chart--${variant}`}>
      <svg viewBox={`${-PAD} 0 ${round(g.w + PAD * 2)} ${l.height}`} role="img" aria-label={label}>
        <path className="ar" d={g.area} />
        <path className="ln" d={g.line} style={vars({ '--len': g.len })} />
        {g.pts.map(([x, y], i) => (
          <g key={i} style={vars({ '--i': i })}>
            <circle className="pt" cx={round(x)} cy={round(y)} r={l.radius} />
            <text className="tv" x={round(x)} y={round(y - l.radius - 6)} textAnchor="middle">
              {formatTemp(hours[i].temp)}
            </text>
            {variant === 'full' && <WeatherIcon kind={hours[i].kind} decorative x={round(x - 12)} y={l.icons} size={24} />}
            <text x={round(x)} y={l.labels} textAnchor="middle">
              {hours[i].hour}h
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
