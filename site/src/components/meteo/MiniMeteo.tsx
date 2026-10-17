import Link from 'next/link'
import type { CSSProperties } from 'react'
import { formatTemp, KIND_LABEL } from '@/lib/meteo'
import { getMeteo } from './data'
import { PauseOffscreen } from './PauseOffscreen'
import { WeatherIcon } from './WeatherIcon'
import '@/styles/meteo.css'

/**
 * Tuile « Météo express » de la mosaïque À la une (maquette .b-meteo) : la ville principale aujourd'hui.
 * Rend la tuile entière ; rien sans prévision du jour (la grille du bento se réorganise avec :has(.b-meteo)).
 */
export async function MiniMeteo() {
  const data = await getMeteo()
  const day = data?.days[0]
  if (!data || !day || day.date !== data.today) return null
  const { main } = day
  // libellé court de la ville principale (« Éclaircies »), le libellé du jour pouvant être une phrase
  const label = day.cities.find((c) => c.name === main.city)?.label ?? KIND_LABEL[main.kind]

  return (
    <article className="tile b-meteo" data-reveal style={{ '--d': 3 } as CSSProperties}>
      <PauseOffscreen className="mini-meteo">
        <div className="mini-meteo__top">
          <span className="badge badge--glass">Météo express</span>
          <h3 className="mini-meteo__city">
            <Link className="stretched" href="/meteo">
              <span className="sr-only">Météo à </span>
              {main.city}
            </Link>
          </h3>
        </div>
        <div className="mini-meteo__row">
          <WeatherIcon kind={main.kind} decorative />
          <div>
            <div className="mini-meteo__t">{formatTemp(main.now)}</div>
            <div className="mini-meteo__lbl">{label}</div>
            <div className="mini-meteo__mm">
              Min {formatTemp(main.min)} · Max {formatTemp(main.max)}
            </div>
          </div>
        </div>
      </PauseOffscreen>
    </article>
  )
}
