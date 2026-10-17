import type { ReactElement } from 'react'
import { KIND_LABEL } from '@/lib/meteo'
import type { WeatherKind } from '@/lib/meteo-types'

// Icônes météo animées de la maquette (SVG 24 × 24) ; animations CSS dans meteo.css (transform / opacity uniquement).
const SUN = '#F4C752'
const RAYS = (
  <g className="rays" stroke={SUN} strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4 7 7M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6" />
  </g>
)
const DISC = <circle cx="12" cy="12" r="4.6" fill={SUN} />
const LOW_CLOUD = 'M7 15.5h10.5a4.2 4.2 0 0 0 .6-8.36A6.2 6.2 0 0 0 5.8 7.7 4 4 0 0 0 7 15.5z'

const SHAPES: Record<WeatherKind, ReactElement> = {
  sun: (
    <>
      {RAYS}
      {DISC}
    </>
  ),
  partly: (
    <>
      <g transform="translate(-3 -3.4) scale(.8)">
        {RAYS}
        {DISC}
      </g>
      <g className="cl">
        <path d="M9.2 20.5h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 8.2 13a3.8 3.8 0 0 0 1 7.5z" fill="#E1E8F3" />
      </g>
    </>
  ),
  cloud: (
    <g className="cl">
      <path d="M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.7 10.6 4.3 4.3 0 0 0 7 19z" fill="#C9D4E6" />
    </g>
  ),
  rain: (
    <>
      <g className="cl">
        <path d={LOW_CLOUD} fill="#AFBDD4" />
      </g>
      <g stroke="#6FA8F2" strokeWidth="1.8" strokeLinecap="round">
        <path className="drop" d="m8.5 18-1 2.5" />
        <path className="drop" d="m12.5 18-1 2.5" />
        <path className="drop" d="m16.5 18-1 2.5" />
      </g>
    </>
  ),
  snow: (
    <>
      <g className="cl">
        <path d={LOW_CLOUD} fill="#C9D4E6" />
      </g>
      <g fill="#fff">
        <circle className="drop" cx="8.5" cy="19" r="1.2" />
        <circle className="drop" cx="12.5" cy="20.5" r="1.2" />
        <circle className="drop" cx="16.5" cy="19" r="1.2" />
      </g>
    </>
  ),
  fog: (
    <>
      <path d="M7 11.5h10.5a4 4 0 0 0 .5-7.96A6 6 0 0 0 6 4.1 3.7 3.7 0 0 0 7 11.5z" fill="#C3CEDF" opacity=".8" />
      <g stroke="#AEBBD1" strokeWidth="1.8" strokeLinecap="round">
        <path className="fogl" d="M4 15h16" />
        <path className="fogl" d="M6 18.5h12" />
        <path className="fogl" d="M8 22h8" />
      </g>
    </>
  ),
  // absente de la maquette : nuage sombre et éclair qui scintille
  storm: (
    <>
      <g className="cl">
        <path d={LOW_CLOUD} fill="#97A6BF" />
      </g>
      <path className="bolt" d="M12.9 13.2 9.6 18.4h2.7l-1.1 4.1 4.3-5.9h-2.8l1.5-3.4z" fill={SUN} />
    </>
  ),
}

/**
 * Icône météo animée. `label` remplace le libellé par défaut (« Éclaircies »…) ; `decorative` la masque aux lecteurs
 * d'écran quand le texte voisin dit déjà le temps qu'il fait. `x`, `y` et `size` servent à l'imbriquer dans un autre SVG.
 */
export function WeatherIcon({
  kind,
  label,
  decorative = false,
  className,
  x,
  y,
  size,
}: {
  kind: WeatherKind
  label?: string
  decorative?: boolean
  className?: string
  x?: number
  y?: number
  size?: number
}) {
  return (
    <svg
      className={className ? `wi ${className}` : 'wi'}
      viewBox="0 0 24 24"
      x={x}
      y={y}
      width={size}
      height={size}
      focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label || KIND_LABEL[kind] })}
    >
      {SHAPES[kind]}
    </svg>
  )
}
