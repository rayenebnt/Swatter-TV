import { isOnAir } from '@/lib/broadcast'
import { getProgrammeWeek } from './data'
import { buildGridData, tvDay } from './model'
import { TvGrid } from './TvGrid'
import '@/styles/programme.css'

/**
 * Grille horaire du programme TV (soirées d'aujourd'hui → J+6, de 18 h à 0 h 30, heure de Paris).
 * - variant « home » : section de l'accueil (masquée si aucun programme n'est publié) ;
 * - variant « full » : page /programme-tv, `day` = soirée affichée d'abord (?jour=, ce soir sinon).
 * `onAirAtRender` : état de l'antenne au rendu (premier rendu du navigateur identique) ; la page pouvant être servie
 * depuis le cache, TvGrid le recalcule ensuite avec l'heure du visiteur.
 */
export async function TvGridSection({ variant = 'home', day }: { variant?: 'home' | 'full'; day?: string }) {
  const now = new Date()
  const today = tvDay(now)
  const data = buildGridData(await getProgrammeWeek(today), today, now.getTime())
  if (variant === 'home' && !data.days.some((d) => d.slots.length)) return null
  const initialDay = day && data.days.some((d) => d.key === day) ? day : today
  const home = variant === 'home'
  return (
    <section className="section container" id={home ? 'programme' : 'grille'} aria-labelledby={home ? 'prog-title' : 'grille-title'}>
      <TvGrid data={data} initialDay={initialDay} variant={variant} onAirAtRender={isOnAir(now)} />
    </section>
  )
}
