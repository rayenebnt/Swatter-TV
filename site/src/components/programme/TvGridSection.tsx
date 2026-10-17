import { getProgrammeWeek } from './data'
import { buildGridData, tvDay } from './model'
import { TvGrid } from './TvGrid'
import '@/styles/programme.css'

/**
 * Grille horaire du programme TV (aujourd'hui → J+6, jours civils de Paris).
 * - variant « home » : section de l'accueil (masquée si aucun programme n'est publié) ;
 * - variant « full » : page /programme-tv, `day` = jour affiché d'abord (?jour=, aujourd'hui sinon).
 */
export async function TvGridSection({ variant = 'home', day }: { variant?: 'home' | 'full'; day?: string }) {
  const today = tvDay()
  const data = buildGridData(await getProgrammeWeek(today), today)
  if (variant === 'home' && !data.days.some((d) => d.slots.length)) return null
  const initialDay = day && data.days.some((d) => d.key === day) ? day : today
  const home = variant === 'home'
  return (
    <section className="section container" id={home ? 'programme' : 'grille'} aria-labelledby={home ? 'prog-title' : 'grille-title'}>
      <TvGrid data={data} initialDay={initialDay} variant={variant} />
    </section>
  )
}
