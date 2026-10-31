// Noms des départements dans une phrase (Info, Agenda, Webcams, Météo) (« L'info en Haute-Savoie », « Toute l'actualité de l'Isère »).
import { OTHER_REGIONS, type DepartmentSlug, type InfoZone } from '@/lib/departments'

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

/** « en Haute-Savoie » (« en Auvergne-Rhône-Alpes » pour toute la région) */
export const inPlace = (d: DepartmentSlug | null) => (d ? PHRASES[d].in : 'en Auvergne-Rhône-Alpes')

/** « de la Haute-Savoie » (« de toute la région » pour toute la région) */
export const ofPlace = (d: DepartmentSlug | null) => (d ? PHRASES[d].of : 'de toute la région')

/** L'Info : comme inPlace, et « hors Auvergne-Rhône-Alpes » pour « Autres régions » (« l'info hors Auvergne-Rhône-Alpes »). */
export const infoInPlace = (z: InfoZone | null) => (z === OTHER_REGIONS ? 'hors Auvergne-Rhône-Alpes' : inPlace(z))

/** L'Info : comme ofPlace, et « des autres régions » pour « Autres régions » (« Toute l'info des autres régions »). */
export const infoOfPlace = (z: InfoZone | null) => (z === OTHER_REGIONS ? 'des autres régions' : ofPlace(z))
