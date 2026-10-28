// Logo de Swatter TV (lib/logo.ts) pour l'administration : « SWATTER » prend la couleur du texte (currentColor), lisible
// dans les thèmes clair et sombre ; le reste garde son doré.
import { LOGO_GOLD_PATH, LOGO_GOLD_STOPS, LOGO_VIEWBOX, LOGO_WHITE_PATH } from '@/lib/logo'

/** `id` : identifiant unique du dégradé (le logo et l'icône peuvent cohabiter sur une même page). */
export function Marque({ id, className, title }: { id: string; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox={LOGO_VIEWBOX} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="992" gradientUnits="userSpaceOnUse">
          {LOGO_GOLD_STOPS.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <path d={LOGO_GOLD_PATH} fill={`url(#${id})`} fillRule="evenodd" />
      <path d={LOGO_WHITE_PATH} fill="currentColor" />
    </svg>
  )
}
