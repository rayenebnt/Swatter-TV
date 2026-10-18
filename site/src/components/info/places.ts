// L'Info : noms des départements dans une phrase (« L'info en Haute-Savoie », « Toute l'actualité de l'Isère »).
import type { DepartmentSlug } from '@/lib/departments'

const PHRASES: Record<DepartmentSlug, { in: string; of: string }> = {
  'haute-savoie': { in: 'en Haute-Savoie', of: 'de la Haute-Savoie' },
  savoie: { in: 'en Savoie', of: 'de la Savoie' },
  ain: { in: 'dans l’Ain', of: 'de l’Ain' },
  isere: { in: 'en Isère', of: 'de l’Isère' },
  rhone: { in: 'dans le Rhône', of: 'du Rhône' },
  loire: { in: 'dans la Loire', of: 'de la Loire' },
  'haute-loire': { in: 'en Haute-Loire', of: 'de la Haute-Loire' },
  drome: { in: 'dans la Drôme', of: 'de la Drôme' },
  ardeche: { in: 'en Ardèche', of: 'de l’Ardèche' },
  'puy-de-dome': { in: 'dans le Puy-de-Dôme', of: 'du Puy-de-Dôme' },
  cantal: { in: 'dans le Cantal', of: 'du Cantal' },
  allier: { in: 'dans l’Allier', of: 'de l’Allier' },
}

/** « en Haute-Savoie » (la Haute-Savoie aussi sans département précis : c'est toute l'info du site) */
export const inPlace = (d: DepartmentSlug | null) => PHRASES[d ?? 'haute-savoie'].in

/** « de la Haute-Savoie » */
export const ofPlace = (d: DepartmentSlug | null) => PHRASES[d ?? 'haute-savoie'].of
