'use client'

import Link from 'next/link'
import { Fragment, useRef, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatTime } from '@/lib/format'
import { BROADCAST_END_LABEL, onAirState, RESUME_TONIGHT, upcomingGroups, type OnAirData } from '@/lib/on-air'
import type { Slot } from '@/lib/queries/schedule'
import { programUrl } from '@/lib/urls'
import { useAirNow } from './useOnAir'
import { useNow } from './useNow'
import { useOffscreen } from './useOffscreen'

const ms = (iso: string) => new Date(iso).getTime()
/** « 42 min », « 1 h 05 » */
const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`)

function SlotTitle({ slot }: { slot: Slot }) {
  return slot.programSlug ? <Link href={programUrl({ slug: slot.programSlug })}>{slot.title}</Link> : <>{slot.title}</>
}

/**
 * « En ce moment / À suivre » de la page Direct.
 * Premier rendu identique au serveur (instant du rendu, OnAirData.at) ; après l'hydratation, l'antenne, le programme en
 * cours, la progression et le temps restant suivent l'heure du navigateur (page servie depuis le cache, onglet ouvert).
 * Hors antenne (de 0 h 30 à 18 h) : « Hors antenne · Reprise ce soir à 18 h » ; à l'antenne sans programme saisi :
 * « En direct jusqu'à 0 h 30 ». Dans « À suivre », la fin de l'antenne est annoncée avant les créneaux d'une autre soirée,
 * nommée (« Demain soir », « Ce soir »…).
 */
export function OnAirPanel({ data, max = 3 }: { data: OnAirData<Slot>; max?: number }) {
  const now = useAirNow(data.at)
  // progression et temps restant : seulement dans le navigateur (au rendu serveur, barre vide)
  const hydrated = useNow() !== null
  const root = useRef<HTMLElement>(null)
  // Point « en direct » (animation en boucle) en pause hors écran
  const paused = useOffscreen(root)
  const state = onAirState(data.slots, now)
  const cur = state.current
  const progress = cur && hydrated ? Math.min(1, Math.max(0, (now - ms(cur.start)) / (ms(cur.end) - ms(cur.start) || 1))) : null
  const remaining = cur && hydrated ? Math.max(1, Math.ceil((ms(cur.end) - now) / 60_000)) : null
  const groups = upcomingGroups(state, now, max)

  return (
    <aside ref={root} className={`onair${paused ? ' is-paused' : ''}`} aria-labelledby="onair-title" data-onair={state.onAir ? 'antenne' : 'hors-antenne'}>
      <h2 id="onair-title" className="onair__title">
        Au programme
      </h2>
      {cur ? (
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
      ) : (
        // à l'antenne entre deux créneaux (ou sans grille), ou hors antenne : jamais de vide à la place du programme en cours
        <div className="onair__now">
          <p className="onair__label">
            {state.onAir && <span className="dot-live" aria-hidden="true" />}
            {state.onAir ? 'En ce moment' : 'Hors antenne'}
          </p>
          <h3 className="onair__now-title">{state.onAir ? `En direct jusqu’à ${BROADCAST_END_LABEL}` : RESUME_TONIGHT}</h3>
          <p className="onair__sub">Swatter TV Info, tous les soirs de 18 h à {BROADCAST_END_LABEL}</p>
        </div>
      )}
      {groups.length > 0 && (
        <>
          <h3 className="onair__label">À suivre</h3>
          <ol className="onair__list">
            {groups.map((g) => (
              <Fragment key={g.day}>
                {g.endBefore && <li className="onair__sep onair__sep--end">Fin des programmes à {BROADCAST_END_LABEL}</li>}
                {g.heading && <li className="onair__sep">{g.heading}</li>}
                {g.slots.map((s) => (
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
              </Fragment>
            ))}
          </ol>
        </>
      )}
      {!groups.length && <p className="onair__empty">La grille des prochaines soirées sera bientôt disponible.</p>}
      <Link className="link-more" href="/programme-tv">
        Voir la grille complète <Icon name="arrow" />
      </Link>
    </aside>
  )
}
