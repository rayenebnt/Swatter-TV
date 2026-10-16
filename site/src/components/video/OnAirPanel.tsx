'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatTime } from '@/lib/format'
import type { Slot } from '@/lib/queries/schedule'
import { programUrl } from '@/lib/urls'
import { useNow } from './useNow'

const ms = (iso: string) => new Date(iso).getTime()
/** « 42 min », « 1 h 05 » */
const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`)

function SlotTitle({ slot }: { slot: Slot }) {
  return slot.programSlug ? <Link href={programUrl({ slug: slot.programSlug })}>{slot.title}</Link> : <>{slot.title}</>
}

/**
 * « En ce moment / À suivre » de la page Direct.
 * Premier rendu identique au serveur (créneaux calculés au rendu de la page) ; après l'hydratation,
 * le programme en cours, la progression et le temps restant suivent l'heure du navigateur (page servie depuis le cache).
 */
export function OnAirPanel({ current, next, max = 3 }: { current: Slot | null; next: Slot[]; max?: number }) {
  const now = useNow()
  let cur = current
  let upcoming = next
  if (now !== null) {
    const all = current ? [current, ...next] : next
    cur = all.find((s) => ms(s.start) <= now && ms(s.end) > now) ?? null
    upcoming = all.filter((s) => ms(s.start) > now)
  }
  const progress = cur && now !== null ? Math.min(1, Math.max(0, (now - ms(cur.start)) / (ms(cur.end) - ms(cur.start) || 1))) : null
  const remaining = cur && now !== null ? Math.max(1, Math.ceil((ms(cur.end) - now) / 60_000)) : null
  const shown = upcoming.slice(0, max)

  return (
    <aside className="onair" aria-labelledby="onair-title">
      <h2 id="onair-title" className="onair__title">
        Au programme
      </h2>
      {cur && (
        <div className="onair__now">
          <p className="onair__label">
            <span className="dot-live" aria-hidden="true" />
            En ce moment
          </p>
          <h3 className="onair__now-title">
            <SlotTitle slot={cur} />
          </h3>
          <p className="onair__sub">
            <time dateTime={cur.start}>{formatTime(cur.start)}</time> – <time dateTime={cur.end}>{formatTime(cur.end)}</time>
            {cur.genreLabel && ` · ${cur.genreLabel}`}
          </p>
          {cur.synopsis && <p className="onair__synopsis">{cur.synopsis}</p>}
          <div
            className="onair__bar"
            role="progressbar"
            aria-label="Progression du programme en cours"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
          >
            <span style={{ '--p': progress ?? 0 } as CSSProperties} />
          </div>
          <p className="onair__lbl">
            <span>{formatTime(cur.start)}</span>
            <span>{remaining !== null ? `Encore ${minutes(remaining)}` : ''}</span>
            <span>{formatTime(cur.end)}</span>
          </p>
        </div>
      )}
      {shown.length > 0 && (
        <>
          <h3 className="onair__label">À suivre</h3>
          <ol className="onair__list">
            {shown.map((s) => (
              <li key={s.id} className="onair__item">
                <time dateTime={s.start}>{formatTime(s.start)}</time>
                <div>
                  <strong>
                    <SlotTitle slot={s} />
                  </strong>
                  <span>{[s.genreLabel, minutes(s.durationMinutes), s.isPremiere ? 'Inédit' : ''].filter(Boolean).join(' · ')}</span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {!cur && !shown.length && <p className="onair__empty">La grille des programmes sera bientôt disponible.</p>}
      <Link className="link-more" href="/programme-tv">
        Voir la grille complète <Icon name="arrow" />
      </Link>
    </aside>
  )
}
