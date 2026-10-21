import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import type { DepartmentSlug } from '@/lib/departments'
import { isOpenMeteo } from '@/lib/meteo'
import { getMeteo, updatedLabel } from './data'
import { MeteoPanel } from './MeteoPanel'
import { WeatherIcon } from './WeatherIcon'
import '@/styles/meteo.css'

/** Attribution de la source : lien et licence pour Open-Meteo, sinon la source telle quelle. */
function Source({ source }: { source: string }) {
  if (!source) return null
  if (!isOpenMeteo(source)) return <span>{source}</span>
  return (
    <span>
      Données&nbsp;: <a href="https://open-meteo.com/">Open-Meteo</a> (
      <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" rel="license">
        CC BY 4.0
      </a>
      )
    </span>
  )
}

/** État vide de la page Météo (aucune prévision exploitable). */
function MeteoEmpty() {
  return (
    <div className="empty meteo-empty" role="status">
      <WeatherIcon kind="partly" decorative />
      <div>
        <b>Prévisions momentanément indisponibles</b>
        Les données météo seront de retour très bientôt. En attendant, découvrez les images en direct de nos <Link href="/webcams">webcams</Link>.
      </div>
    </div>
  )
}

/**
 * Widget météo : onglets des jours, temps actuel, courbe horaire, matin / après-midi / soirée, villes, bulletin.
 * - 'aside' : colonne compacte de l'accueil (maquette #meteo) ; rien sans prévision (l'info prend alors toute la largeur) ;
 * - 'full' : version large de la page /meteo (cartes des jours, grille des villes, grande courbe) ; état vide sinon.
 */
export async function MeteoWidget({ variant = 'aside', dept = null }: { variant?: 'aside' | 'full'; dept?: DepartmentSlug | null }) {
  const data = await getMeteo(dept)
  if (!data) return variant === 'full' ? <MeteoEmpty /> : null

  const updated = updatedLabel(data.updatedAt, data.today)
  const count = data.days.length
  const head = (
    <div key="head" className="meteo__top">
      {variant === 'aside' ? (
        <h2 id="meteo-title">La Météo</h2>
      ) : (
        <h2 id="meteo-forecast-title">{count > 1 ? `Prévisions à ${count} jours` : 'Prévisions du jour'}</h2>
      )}
      <span>{data.region}</span>
    </div>
  )
  const foot = (
    <div key="foot" className="meteo__foot">
      <p>
        {updated}
        {updated && data.source && <span aria-hidden="true"> · </span>}
        <Source source={data.source} />
      </p>
      {variant === 'aside' && (
        <Link className="link-more" href="/meteo">
          Toute la météo <Icon name="arrow" />
        </Link>
      )}
    </div>
  )

  return <MeteoPanel variant={variant} days={data.days} today={data.today} head={head} foot={foot} />
}
