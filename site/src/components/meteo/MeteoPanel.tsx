'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Seg } from '@/components/ui/Seg'
import { parisDay } from '@/lib/format'
import { addDays, formatTemp } from '@/lib/meteo'
import { CountUp } from './CountUp'
import type { MeteoDay } from './data'
import { MeteoChart, type ChartVariant } from './MeteoChart'
import { usePauseOffscreen } from './usePauseOffscreen'
import { WeatherIcon } from './WeatherIcon'

const noSubscribe = () => () => {}

/** Noms d'un jour : onglet compact, carte de la version large, titre accessible du panneau. */
function dayNames(d: MeteoDay, today: string, tomorrow: string) {
  const relative = d.date === today ? 'Aujourd’hui' : d.date === tomorrow ? 'Demain' : null
  const full = `${d.weekday.toLowerCase()} ${d.dayMonth}`
  return {
    tab: relative ?? d.short,
    card: relative ?? d.weekday,
    panel: relative ? `Prévisions pour ${relative.toLowerCase()}, ${full}` : `Prévisions pour ${full}`,
  }
}

/** Contenu d'un jour : temps actuel, courbe, matin / après-midi / soirée, villes, bulletin. */
function DayView({
  day,
  variant,
  chartWidth,
  onChartWidth,
}: {
  day: MeteoDay
  variant: ChartVariant
  chartWidth: number | null
  onChartWidth: (width: number) => void
}) {
  const { main } = day
  const now = (
    <div className="now">
      <WeatherIcon kind={main.kind} decorative />
      <div className="now__t">
        <CountUp value={main.now} />
      </div>
      <div className="now__txt">
        <div className="now__city">{main.city}</div>
        <div className="now__lbl">{main.label}</div>
        <div className="now__mm">
          Min {formatTemp(main.min)} · Max {formatTemp(main.max)}
        </div>
      </div>
    </div>
  )
  const chart = <MeteoChart hours={day.hours} city={main.city} variant={variant} width={chartWidth} onWidth={onChartWidth} />
  const parts =
    day.parts.length > 0 ? (
      <div className="parts">
        {day.parts.map((p) => (
          <div className="part" key={p.label}>
            {p.label}
            <WeatherIcon kind={p.kind} />
            <b>{formatTemp(p.temp)}</b>
          </div>
        ))}
      </div>
    ) : null
  const bulletin = day.bulletin ? <p className="bulletin">{day.bulletin}</p> : null

  if (variant === 'aside') {
    // la ville principale est déjà en tête : liste des autres villes, maximale seulement (maquette)
    const cities = day.cities.filter((c) => c.name !== main.city)
    return (
      <div className="meteo-panel">
        {now}
        {chart}
        {parts}
        {cities.length > 0 && (
          <ul className="cities">
            {cities.map((c) => (
              <li key={c.name}>
                <WeatherIcon kind={c.kind} label={c.label} />
                <span>{c.name}</span>
                <b>
                  <span className="sr-only">maximum </span>
                  {formatTemp(c.max)}
                </b>
              </li>
            ))}
          </ul>
        )}
        {bulletin}
      </div>
    )
  }

  return (
    <div className="meteo-panel meteo-panel--full">
      <div className="meteo-full__now">
        {now}
        {parts}
      </div>
      <div className="meteo-full__chart">{chart}</div>
      {day.cities.length > 0 && (
        <div className="meteo-full__cities">
          <h3 className="meteo-h3">Dans la région</h3>
          <ul className="city-grid">
            {day.cities.map((c) => (
              <li className="city-card" key={c.name}>
                <WeatherIcon kind={c.kind} decorative />
                <span className="city-card__txt">
                  <b>{c.name}</b>
                  <span>{c.label}</span>
                </span>
                <span className="city-card__mm">
                  <span>
                    <span className="sr-only">minimum </span>
                    {formatTemp(c.min)}
                  </span>
                  <b>
                    <span className="sr-only">maximum </span>
                    {formatTemp(c.max)}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {bulletin && (
        <div className="meteo-full__bulletin">
          <h3 className="meteo-h3">Le bulletin</h3>
          {bulletin}
        </div>
      )}
    </div>
  )
}

/**
 * Partie interactive du widget météo : choix du jour (Seg en version compacte, cartes en version large)
 * et panneau du jour. `head` et `foot` (titre, mise à jour, source) sont rendus par le serveur.
 */
export function MeteoPanel({
  variant,
  days,
  today: renderedToday,
  head,
  foot,
}: {
  variant: ChartVariant
  days: MeteoDay[]
  today: string
  head: ReactNode
  foot: ReactNode
}) {
  const root = useRef<HTMLElement>(null)
  const tabs = useRef<HTMLDivElement>(null)
  usePauseOffscreen(root)
  // hauteur de la colonne de l'accueil (--meteo-h), pour la garder lisible en entier quand elle reste collée
  useEffect(() => {
    const el = root.current
    if (!el || variant !== 'aside') return
    const ro = new ResizeObserver(() => el.style.setProperty('--meteo-h', `${Math.ceil(el.getBoundingClientRect().height)}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [variant])
  // date du jour : celle du rendu serveur à l'hydratation, puis celle du navigateur (page mise en cache la veille)
  const today = useSyncExternalStore(noSubscribe, () => parisDay(), () => renderedToday)
  const upcoming = days.filter((d) => d.date >= today)
  const list = upcoming.length ? upcoming : days
  const [selected, setSelected] = useState(list[0]?.date ?? '')
  const [chartWidth, setChartWidth] = useState<number | null>(null)
  const id = useId()

  const day = list.find((d) => d.date === selected) ?? list[0]
  if (!day) return null
  const tomorrow = addDays(today, 1)
  const panelId = `${id}-panel`
  const view = <DayView key={day.date} day={day} variant={variant} chartWidth={chartWidth} onChartWidth={setChartWidth} />

  if (variant === 'aside') {
    return (
      <aside ref={root} className="meteo meteo--aside" id="meteo" aria-labelledby="meteo-title" data-reveal>
        {head}
        <Seg
          role="tablist"
          ariaLabel="Jour"
          controls={panelId}
          value={day.date}
          onChange={setSelected}
          options={list.map((d) => ({
            value: d.date,
            label: (
              <>
                {dayNames(d, today, tomorrow).tab} <b>{d.num}</b>
              </>
            ),
          }))}
        />
        <div id={panelId} role="tabpanel" tabIndex={0} aria-label={dayNames(day, today, tomorrow).panel}>
          {view}
        </div>
        {foot}
      </aside>
    )
  }

  const index = list.indexOf(day)
  // onglets au clavier : flèches, Début, Fin (focus déplacé sur le jour choisi)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1 + list.length, Home: 0, End: list.length - 1 }
    if (!Object.hasOwn(keys, e.key)) return
    e.preventDefault()
    const next = keys[e.key] % list.length
    setSelected(list[next].date)
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <section ref={root} className="meteo meteo--full" aria-labelledby="meteo-forecast-title" data-reveal>
      {head}
      <div
        ref={tabs}
        className="meteo-days"
        role="tablist"
        aria-label="Jour"
        onKeyDown={onKeyDown}
        style={{ '--n': Math.max(list.length, 4) } as CSSProperties}
      >
        {list.map((d, i) => {
          const on = d === day
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              className="meteo-day"
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(d.date)}
            >
              <span className="meteo-day__name">{dayNames(d, today, tomorrow).card}</span>
              <span className="meteo-day__date">{d.dayMonth}</span>
              <WeatherIcon kind={d.main.kind} decorative />
              <span className="meteo-day__lbl">{d.main.label}</span>
              <span className="meteo-day__mm">
                <span>
                  <span className="sr-only">minimum </span>
                  {formatTemp(d.main.min)}
                </span>
                <b>
                  <span className="sr-only">maximum </span>
                  {formatTemp(d.main.max)}
                </b>
              </span>
            </button>
          )
        })}
      </div>
      <div id={panelId} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-tab-${index}`} className="meteo-full">
        {view}
      </div>
      {foot}
    </section>
  )
}
