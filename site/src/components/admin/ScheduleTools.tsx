'use client'

import { Button, toast, useConfig, useListQuery, useRouteTransition } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import type { Where } from 'payload'
import { shiftDay, tvDay } from '@/components/programme/model'
import { dateChip, parisDateTime } from '@/lib/format'
import { currentMonday, dayLabel, mondayOf, rangeFromWhere, rangeLabel, rangeWhere, weekLabel } from '@/lib/schedule-week'
import { AdminIcon } from './icons'

/** Toute la grille : un filtre toujours vrai, pour ne pas revenir automatiquement à la semaine en cours. */
const ALL: Where = { or: [{ and: [{ startsAt: { exists: true } }] }] }
/** Filtre ALL relu depuis l'adresse (où `true` devient la chaîne « true »). */
const isAll = (where: Where | undefined) => {
  const and = (where?.or as Where[] | undefined)?.[0]?.and as Where[] | undefined
  return where?.or?.length === 1 && and?.length === 1 && String((and[0]?.startsAt as { exists?: unknown } | undefined)?.exists) === 'true'
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/**
 * Outils de la liste « Grille des programmes » (admin.components.beforeListTable) : la liste s'ouvre sur la semaine
 * en cours, on passe d'une semaine ou d'un jour à l'autre, et on recopie une semaine (ou une journée) entière
 * sur la semaine suivante en un clic.
 */
export function ScheduleTools() {
  const { data, query, refineListData } = useListQuery()
  const {
    config: { routes },
  } = useConfig()
  const router = useRouter()
  // pendant un changement de semaine, `query` est déjà à jour mais `data` (rendu serveur) pas encore
  const { isTransitioning } = useRouteTransition()
  const replaceId = useId()
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)

  // la liste s'ouvre toujours filtrée sur la semaine en cours (redirection côté serveur : src/proxy.ts)
  const where = query?.where as Where | undefined
  const range = rangeFromWhere(where)
  const thisWeek = currentMonday()
  const today = tvDay()
  const total = isTransitioning ? undefined : data?.totalDocs

  const show = (first: string, days: 1 | 7) => refineListData({ where: rangeWhere(first, days), page: 1 })

  /** Recopie la plage [first, first + days) sept jours plus tard, puis affiche la plage d'arrivée. */
  const copy = async (first: string, days: 1 | 7) => {
    const target = shiftDay(first, 7)
    const warning = replace ? `\n\nCe qui est déjà saisi sur la ${rangeLabel(target, days)} sera effacé.` : ''
    if (!window.confirm(`Recopier tous les créneaux de la ${rangeLabel(first, days)} sur la ${rangeLabel(target, days)} ?${warning}`)) return
    setBusy(true)
    try {
      const res = await fetch(`${routes.api}/schedule/copy-week`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: first, days, replace }),
      })
      const json = (await res.json().catch(() => ({}))) as { copied?: number; error?: string }
      if (!res.ok) {
        toast.error(json.error || 'La copie a échoué. Réessayez dans un instant.')
        return
      }
      toast.success(`${plural(json.copied ?? 0, 'créneau recopié', 'créneaux recopiés')} sur la ${rangeLabel(target, days)}.`)
      setReplace(false)
      if (range && target === range.first && days === range.days) router.refresh()
      else await show(target, days)
    } catch {
      toast.error('La copie a échoué (connexion interrompue ?). Réessayez dans un instant.')
    } finally {
      setBusy(false)
    }
  }

  if (!range) {
    return (
      <div className="sw-week">
        <div className="sw-week__bar">
          <p className="sw-week__title">Toute la grille{isAll(where) ? '' : ' (filtrée)'}</p>
          <div className="sw-week__nav">
            <Button buttonStyle="secondary" size="small" margin={false} onClick={() => void show(thisWeek, 7)}>
              Revenir à la semaine en cours
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const monday = range.days === 7 ? range.first : mondayOf(range.first)
  const day = range.days === 1 ? range.first : null
  const empty = total === 0
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))

  return (
    <div className="sw-week">
      <div className="sw-week__bar">
        <div>
          <p className="sw-week__title">Semaine {weekLabel(monday)}</p>
          <p className="sw-week__count">
            {monday === thisWeek ? 'Semaine en cours · ' : ''}
            {day ? `${dayLabel(day)} : ` : ''}
            {/* liste pas encore filtrée sur la semaine affichée (ouverture, changement de semaine) : pas de total trompeur */}
            {total !== undefined ? plural(total, 'créneau', 'créneaux') : '…'}
          </p>
        </div>
        <div className="sw-week__nav">
          <Button buttonStyle="secondary" size="small" margin={false} onClick={() => void show(shiftDay(monday, -7), 7)}>
            <AdminIcon name="arrow-left" className="sw-week__arrow" /> Semaine précédente
          </Button>
          <Button buttonStyle="secondary" size="small" margin={false} disabled={monday === thisWeek && !day} onClick={() => void show(thisWeek, 7)}>
            Cette semaine
          </Button>
          <Button buttonStyle="secondary" size="small" margin={false} onClick={() => void show(shiftDay(monday, 7), 7)}>
            Semaine suivante <AdminIcon name="arrow-right" className="sw-week__arrow" />
          </Button>
          <Button buttonStyle="subtle" size="small" margin={false} onClick={() => void refineListData({ where: ALL, page: 1 })}>
            Toute la grille
          </Button>
        </div>
      </div>

      <div className="sw-week__days" role="group" aria-label="Afficher un seul jour">
        <button type="button" className="sw-day" aria-pressed={!day} onClick={() => void show(monday, 7)}>
          Toute la semaine
        </button>
        {weekDays.map((d) => {
          const chip = dateChip(parisDateTime(d, '12:00'))
          return (
            <button key={d} type="button" className="sw-day" aria-pressed={day === d} onClick={() => void show(d, 1)} aria-label={dayLabel(d)}>
              {chip.weekday} {chip.day}
              {d === today && <span className="sw-day__today">aujourd’hui</span>}
            </button>
          )
        })}
      </div>

      <div className="sw-week__copy">
        <AdminIcon name="copy" className="sw-week__copy-icon" />
        {empty ? (
          <p>
            <strong>{day ? 'Cette journée est vide.' : 'Cette semaine est vide.'}</strong> Gagnez du temps : reprenez le programme{' '}
            {day ? `du ${dayLabel(shiftDay(day, -7))}` : 'de la semaine précédente'}, puis ajustez ce qui change.
          </p>
        ) : (
          <p>
            <strong>Gagnez du temps :</strong> recopiez {day ? 'cette journée sur le même jour de la semaine suivante' : 'cette semaine sur la suivante'}, puis
            ajustez seulement ce qui change.
          </p>
        )}
        <div className="sw-week__copy-actions">
          {empty ? (
            <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void copy(shiftDay(range.first, -7), range.days)}>
              {busy ? 'Copie en cours…' : day ? `Reprendre le ${dayLabel(shiftDay(day, -7))}` : 'Reprendre la semaine précédente'}
            </Button>
          ) : (
            <>
              <label className="sw-week__replace" htmlFor={replaceId}>
                <input id={replaceId} type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                Remplacer ce qui est déjà saisi
              </label>
              <Button buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void copy(range.first, range.days)}>
                {busy ? 'Copie en cours…' : day ? `Recopier sur le ${dayLabel(shiftDay(day, 7))}` : 'Recopier sur la semaine suivante'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ScheduleTools
