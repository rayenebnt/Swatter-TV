'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Seg } from '@/components/ui/Seg'
import { INFO_ZONES, OTHER_REGIONS, isInfoZone } from '@/lib/departments'
import { departmentUrl } from '@/lib/urls'
import { LeadCard } from './LeadCard'
import { LiveItem } from './LiveItem'
import { infoOfPlace } from '@/lib/places'
import { agoLabel, feedLabel } from './time'
import { useNow } from './useNow'
import { useSegFade } from '@/components/ui/useSegFade'
import type { ArticleTeaser } from './utils'

const ALL = 'all'
/** Éléments du fil « En continu » sous l'article principal */
const LIVE_COUNT = 5
const delay = (d: number) => ({ '--d': d }) as CSSProperties
const plural = (n: number) => `${n}\u00a0info${n > 1 ? 's' : ''}`

/**
 * Info de l'accueil (maquette : #dept-filters, .lead, .live-list) : filtre par département (et « Autres régions », en
 * dernier, quand le fil en contient), article principal et fil « En continu ». Dates relatives calculées après montage
 * (premier rendu = heure du serveur).
 */
export function InfoFeed({ items }: { items: ArticleTeaser[] }) {
  const [dept, setDept] = useState(ALL)
  // Vrai après le premier choix de l'utilisateur : animation d'apparition (au lieu de la révélation au défilement)
  const [changed, setChanged] = useState(false)
  const [status, setStatus] = useState('')
  const now = useNow()
  const filters = useRef<HTMLDivElement>(null)

  const options = useMemo(
    () => [
      { value: ALL, label: 'Toute la région' },
      ...INFO_ZONES.filter((d) => items.some((i) => i.department === d.value)).map(({ value, label }) => ({ value, label })),
    ],
    [items],
  )
  const list = dept === ALL ? items : items.filter((i) => i.department === dept)
  const [lead, ...rest] = list
  const live = rest.slice(0, LIVE_COUNT)
  const place = isInfoZone(dept) ? dept : null

  const select = (value: string) => {
    const count = value === ALL ? items.length : items.filter((i) => i.department === value).length
    const label = options.find((o) => o.value === value)?.label ?? ''
    setDept(value)
    setChanged(true)
    setStatus(count ? `${label}\u00a0: ${plural(Math.min(count, LIVE_COUNT + 1))}` : `${label}\u00a0: pas encore d’info`)
  }

  // Filtres plus larges que la colonne : fondu sur le bord qui cache des départements
  useSegFade(filters, options.length)

  const anim = (i: number) => (changed ? { className: 'fade-in', style: delay(i) } : {})

  return (
    <div className="info-feed">
      {options.length > 2 && (
        <div ref={filters} className="info-filters" data-reveal>
          <Seg options={options} value={dept} onChange={select} ariaLabel="Filtrer l’info par département" className="seg--bleed" />
        </div>
      )}

      {lead ? (
        <LeadCard
          key={`${dept}:${lead.id}`}
          item={lead}
          reveal={!changed}
          {...anim(0)}
          time={
            <time dateTime={lead.publishedAt} title={lead.full}>
              {now === null ? lead.clock : agoLabel(lead.publishedAt, now)}
            </time>
          }
        />
      ) : (
        <div className={`empty${changed ? ' fade-in' : ''}`}>
          <Icon name="news" />
          <p>
            <b>{place === OTHER_REGIONS ? 'Pas encore d’info hors de la région' : place ? 'Pas encore d’info pour ce département' : 'Pas encore d’info pour le moment'}</b>
            {place ? 'Revenez plus tard ou consultez l’actualité de toute la région.' : 'Revenez bientôt\u00a0: l’actualité de la région s’affichera ici.'}
          </p>
        </div>
      )}

      <div className="live-list" data-reveal hidden={!live.length}>
        <h3 className="live-list__title">
          <span className="dot-live" aria-hidden="true" />
          En continu
        </h3>
        {live.map((it, i) => (
          <LiveItem
            key={`${dept}:${it.id}`}
            item={it}
            {...anim(i + 1)}
            time={
              <time dateTime={it.publishedAt} title={it.full}>
                {now === null ? it.clock : feedLabel(it.publishedAt, it.clock, now)}
              </time>
            }
          />
        ))}
      </div>

      <p className="sr-only" role="status">
        {status}
      </p>

      <div className="info-feed__more">
        <Link className="btn btn--ghost" href={place ? departmentUrl(place) : '/info'}>
          Toute l’actualité{place ? ` ${infoOfPlace(place)}` : ''}
          <Icon name="arrow" />
        </Link>
      </div>
    </div>
  )
}
