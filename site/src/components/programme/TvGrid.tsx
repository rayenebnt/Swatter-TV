'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SectionHead } from '@/components/ui/SectionHead'
import { Seg } from '@/components/ui/Seg'
import { formatTime } from '@/lib/format'
import { useGridGestures, useHash, useNow } from './hooks'
import {
  dayLabel,
  dayLong,
  findAiring,
  GRID_HOURS,
  GRID_MINUTES,
  GRID_START,
  minutesBetween,
  programImage,
  programmeDayUrl,
  slotMeta,
  tvDay,
  type GridData,
} from './model'
import { ProgramDialog } from './ProgramDialog'

const FIRST_HOUR = Number(GRID_START.slice(0, 2))
const HOURS = Array.from({ length: GRID_HOURS }, (_, h) => h)
const hourLabel = (h: number) => `${String((FIRST_HOUR + h) % 24).padStart(2, '0')}:00`
const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End']

/**
 * Place la frise : minute `mid` au centre (émission ciblée), sinon « maintenant » au tiers gauche
 * quand il tombe dans la frise du jour (comme la maquette), sinon le début de la journée.
 */
function placeGrid(scroller: HTMLDivElement, grid: HTMLDivElement, dayStart: string, mid: number | null, smooth: boolean) {
  const px = grid.offsetWidth / GRID_MINUTES
  const m = (Date.now() - Date.parse(dayStart)) / 60_000
  const left = mid !== null ? mid * px - scroller.clientWidth / 2 : m > 0 && m < GRID_MINUTES ? m * px - scroller.clientWidth * 0.35 : 0
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollTo({ left: Math.max(0, left), behavior: smooth && !reduce ? 'smooth' : 'auto' })
}

/**
 * Grille horaire du programme TV : onglets des jours, frise de 6 h à 2 h, ligne « maintenant » (après montage),
 * glisser / molette / tactile, panneau de détail. Le premier rendu ne dépend que des données du serveur.
 */
export function TvGrid({ data, initialDay, variant }: { data: GridData; initialDay: string; variant: 'home' | 'full' }) {
  const router = useRouter()
  const now = useNow()
  const hash = useHash()
  const panelId = useId()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useGridGestures(scrollerRef, wrapRef, gridRef)

  // Jour choisi par le visiteur (null : jour par défaut), oublié quand la page change de jour (?jour=)
  const [picked, setPicked] = useState<string | null>(null)
  const [pageDay, setPageDay] = useState(initialDay)
  if (pageDay !== initialDay) {
    setPageDay(initialDay)
    setPicked(null)
  }
  const [opened, setOpened] = useState<{ day: string; id: number } | null>(null)
  const [dismissedHash, setDismissedHash] = useState('')
  const [focusId, setFocusId] = useState<number | null>(null)

  const has = (key: string) => data.days.some((d) => d.key === key)
  // Jour civil réel, après montage (page mise en cache la veille, onglet resté ouvert après minuit)
  const today = now === null ? data.today : tvDay(new Date(now))
  // Émission demandée par l'adresse (/programme-tv#slug, voir programUrl) : sa prochaine diffusion
  const linked = hash && hash !== dismissedHash && now !== null ? findAiring(data, hash, now) : null
  const dayKey = picked ?? linked?.day ?? (initialDay === data.today && has(today) ? today : initialDay)
  const day = data.days.find((d) => d.key === dayKey) ?? data.days[0]
  const open = opened ?? (linked ? { day: linked.day, id: linked.slot.id } : null)
  const openSlot = open ? data.days.find((d) => d.key === open.day)?.slots.find((s) => s.id === open.id) : undefined

  // Défilement initial (après montage) et à chaque changement de jour
  const ready = now !== null
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const grid = gridRef.current
    if (ready && scroller && grid) placeGrid(scroller, grid, day.start, null, false)
  }, [ready, day.start])
  // Émission liée par l'adresse : centrée
  const linkedMid = linked && linked.day === day.key ? (linked.slot.from + linked.slot.to) / 2 : null
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const grid = gridRef.current
    if (linkedMid !== null && scroller && grid) placeGrid(scroller, grid, day.start, linkedMid, false)
  }, [linkedMid, day.start])

  const selectDay = (key: string) => {
    setPicked(key)
    setFocusId(null)
    if (variant === 'full' && key !== day.key) router.replace(programmeDayUrl(key, data.today), { scroll: false })
  }

  const goNow = () => {
    const key = tvDay(new Date())
    const target = has(key) ? key : data.days[0].key
    if (target !== day.key) selectDay(target)
    else if (scrollerRef.current && gridRef.current) placeGrid(scrollerRef.current, gridRef.current, day.start, null, true)
  }

  const closeDialog = () => {
    if (!opened && linked) {
      // Ouvert depuis l'adresse : on reste sur ce jour et le focus revient au bloc de l'émission
      const { day: linkedDay, slot } = linked
      setPicked(linkedDay)
      setDismissedHash(hash)
      if (variant === 'full' && linkedDay !== initialDay) router.replace(programmeDayUrl(linkedDay, data.today), { scroll: false })
      requestAnimationFrame(() => scrollerRef.current?.querySelector<HTMLElement>(`[data-id="${slot.id}"]`)?.focus())
    }
    setOpened(null)
  }

  // Flèches, Début, Fin : d'une émission à l'autre (un seul arrêt de tabulation dans la frise)
  const onListKey = (e: KeyboardEvent<HTMLOListElement>) => {
    if (!NAV_KEYS.includes(e.key)) return
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.blk')]
    const i = items.findIndex((b) => b === e.target)
    if (i < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i + (e.key === 'ArrowRight' ? 1 : -1)
    items[Math.min(items.length - 1, Math.max(0, next))]?.focus()
  }

  const dayStart = Date.parse(day.start)
  const nowMin = now === null ? null : (now - dayStart) / 60_000
  const liveSlot = now === null ? undefined : day.slots.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end))
  const tabId = (focusId !== null && day.slots.some((s) => s.id === focusId) ? focusId : liveSlot?.id) ?? day.slots[0]?.id
  const home = variant === 'home'

  return (
    <>
      <SectionHead eyebrow={home ? 'Ce soir et cette semaine' : 'Heure par heure'} title={home ? 'Programme TV' : 'La grille de la semaine'} titleId={home ? 'prog-title' : 'grille-title'}>
        <Seg
          role="tablist"
          ariaLabel="Jour du programme"
          controls={panelId}
          value={day.key}
          onChange={selectDay}
          options={data.days.map((d) => ({
            value: d.key,
            label: (
              <>
                {dayLabel(d.key, today)}
                <span className="sr-only"> ({dayLong(d.key)})</span>
              </>
            ),
          }))}
        />
        <button className="btn btn--ghost btn--sm" type="button" onClick={goNow}>
          <Icon name="now" />
          Maintenant
          <span className="sr-only">&nbsp;: aller à l’émission en cours</span>
        </button>
        {home && (
          <Link className="link-more" href="/programme-tv">
            Toute la grille
            <Icon name="arrow" />
          </Link>
        )}
      </SectionHead>

      <div ref={wrapRef} className="grid-wrap" data-reveal id={panelId} role="tabpanel" aria-label={`Programme du ${dayLong(day.key)}`}>
        <div className="grid-fade l" aria-hidden="true" />
        <div className="grid-fade r" aria-hidden="true" />
        <div ref={scrollerRef} className="grid-scroll">
          <div ref={gridRef} className="tvgrid" style={{ '--hours': GRID_HOURS } as CSSProperties}>
            <div className="ruler" aria-hidden="true">
              {HOURS.map((h) => (
                <Fragment key={h}>
                  <span style={{ '--h': h } as CSSProperties}>{hourLabel(h)}</span>
                  <i style={{ '--h': h } as CSSProperties} />
                </Fragment>
              ))}
            </div>
            <ol key={day.key} className="tvgrid__list" role="list" onKeyDown={onListKey}>
              {day.slots.map((s) => {
                const p = data.programs[s.prog]
                const a = Date.parse(s.start)
                const b = Date.parse(s.end)
                const progress = now !== null && now >= a && now < b ? (now - a) / (b - a) : null
                const live = progress !== null
                const past = now !== null && now >= b
                const w = s.to - s.from
                // Image atténuée sous un dégradé : taille fixe (srcset 1x / 2x), plus large pour les longues émissions
                const iw = (w * 280) / 60 > 384 ? 640 : 384
                const cls = ['blk', live && 'is-now', past && 'is-past', s.cutL && 'is-cut-l', s.cutR && 'is-cut-r'].filter(Boolean).join(' ')
                const label = [s.title, `${formatTime(s.start)} – ${formatTime(s.end)}`, p?.genreLabel, p?.isPremiere && 'inédit', live && 'en cours'].filter(Boolean).join(', ')
                return (
                  <li key={s.id} className="tvgrid__item" style={{ '--s': s.from, '--w': w } as CSSProperties}>
                    <button
                      type="button"
                      className={cls}
                      data-id={s.id}
                      tabIndex={s.id === tabId ? 0 : -1}
                      aria-haspopup="dialog"
                      aria-label={label}
                      title={`${s.title} · ${formatTime(s.start)}`}
                      style={live ? ({ '--p': progress } as CSSProperties) : undefined}
                      onClick={() => setOpened({ day: day.key, id: s.id })}
                      onFocus={() => setFocusId(s.id)}
                    >
                      <Image src={programImage(p)} alt="" width={iw} height={Math.round((iw * 9) / 16)} />
                      {live && (
                        <span className="badge badge--live" aria-hidden="true">
                          <i />
                          <span>En cours</span>
                        </span>
                      )}
                      <time dateTime={s.start}>{formatTime(s.start)}</time>
                      <strong>{s.title}</strong>
                      <small>{slotMeta(p, minutesBetween(s.start, s.end))}</small>
                      {live && <span className="pfill" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ol>
            {now !== null && nowMin !== null && nowMin >= 0 && nowMin < GRID_MINUTES && (
              <div className={`nowline${nowMin < 15 ? ' is-start' : nowMin > GRID_MINUTES - 15 ? ' is-end' : ''}`} style={{ '--now': nowMin } as CSSProperties} aria-hidden="true">
                <span>{formatTime(new Date(now))}</span>
              </div>
            )}
          </div>
        </div>
        {!day.slots.length && (
          <div className="grid-empty" role="status">
            <Icon name="cal" />
            <p>
              <b>Aucun programme ce jour-là</b>
              La grille du {dayLong(day.key)} n’est pas encore publiée.
            </p>
          </div>
        )}
      </div>

      {open && openSlot && <ProgramDialog slot={openSlot} program={data.programs[openSlot.prog]} day={open.day} now={now} onClose={closeDialog} />}
    </>
  )
}
