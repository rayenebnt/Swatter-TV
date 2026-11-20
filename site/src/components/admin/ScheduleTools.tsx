'use client'

import { Button, toast, useConfig, useListQuery, useRouteTransition } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import type { Where } from 'payload'
import { shiftDay, tvDay } from '@/components/programme/model'
import { BROADCAST_HOURS_LABEL, slotOutsideBroadcast } from '@/lib/broadcast'
import { dateChip, parisDateTime } from '@/lib/format'
import { currentMonday, dayLabel, mondayOf, rangeFromWhere, rangeLabel, rangeWhere, weekEveningsLabel } from '@/lib/schedule-week'
import { AdminIcon } from './icons'
import { programName } from '@/lib/schedule-programs'
import {
  findOfflinePrograms,
  offlineProgramsNotice,
  programIds,
  publishPrograms,
  publishSlots,
  unpublishedDetail,
  unpublishedSlots,
  type OfflineProgram,
  type PendingSlot,
} from './slotPublication'

/** Toute la grille : un filtre toujours vrai, pour ne pas revenir automatiquement à la semaine en cours. */
const ALL: Where = { or: [{ and: [{ startsAt: { exists: true } }] }] }
/** Filtre ALL relu depuis l'adresse (où `true` devient la chaîne « true »). */
const isAll = (where: Where | undefined) => {
  const and = (where?.or as Where[] | undefined)?.[0]?.and as Where[] | undefined
  return where?.or?.length === 1 && and?.length === 1 && String((and[0]?.startsAt as { exists?: unknown } | undefined)?.exists) === 'true'
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Fin du message de réussite d'une recopie ou d'un collage : les anciens créneaux hors antenne laissés de côté. */
const skippedNote = (skipped?: number) =>
  skipped
    ? ` ${plural(skipped, 'créneau', 'créneaux')} en dehors des horaires d’antenne (${BROADCAST_HOURS_LABEL}) ${skipped > 1 ? 'n’ont pas été recopiés' : 'n’a pas été recopié'}.`
    : ''

/**
 * Soirée copiée (« Copier cette soirée »), en attente d'être collée sur une ou plusieurs autres soirées : gardée le temps
 * de l'onglet (sessionStorage), d'une semaine à l'autre et après un rechargement ; sans stockage (navigation privée
 * stricte), le temps de la page. Lue avec useSyncExternalStore : rien côté serveur, pas d'écart à l'hydratation.
 */
const CLIP_KEY = 'swatter-grille-soiree-copiee'
let clipInMemory: string | null = null
const clipListeners = new Set<() => void>()

function readClip(): string | null {
  try {
    const day = window.sessionStorage.getItem(CLIP_KEY)
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
  } catch {
    return clipInMemory
  }
}

function storeClip(day: string | null) {
  clipInMemory = day
  try {
    if (day) window.sessionStorage.setItem(CLIP_KEY, day)
    else window.sessionStorage.removeItem(CLIP_KEY)
  } catch {
    // stockage indisponible : la copie dure le temps de la page
  }
  clipListeners.forEach((listener) => listener())
}

function subscribeClip(listener: () => void) {
  clipListeners.add(listener)
  return () => {
    clipListeners.delete(listener)
  }
}

type CopyAnswer = { copied?: number; skipped?: number; error?: string }

/** Créneaux de la liste affichée hors des horaires d'antenne (anciennes données : début avant 18 h, fin après 0 h 30…). */
function countOffAir(docs: unknown[] | undefined): number {
  return (docs ?? []).filter((d) => {
    const { startsAt, durationMinutes } = (d ?? {}) as { startsAt?: unknown; durationMinutes?: unknown }
    return typeof startsAt === 'string' && slotOutsideBroadcast(new Date(startsAt), typeof durationMinutes === 'number' ? durationMinutes : 0) !== null
  }).length
}

/**
 * Outils de la liste « Grille des programmes » (admin.components.beforeListTable) : la liste s'ouvre sur la semaine
 * en cours, on passe d'une semaine ou d'une soirée à l'autre, et on recopie une semaine (ou une soirée) entière
 * sur la semaine suivante en un clic, ou on copie une soirée pour la coller sur un ou plusieurs autres jours, de la même
 * semaine ou d'une autre. Rappelle les horaires d'antenne (18 h – 0 h 30) et la saisie des créneaux après
 * minuit, à la date du lendemain. Signale les créneaux restés en brouillon (jamais publiés, ou modifiés sans être
 * republiés : les visiteurs ne voient que la version publiée) et les émissions jamais publiées (le site affiche leurs
 * créneaux sans leur nom), et les publie d'un clic.
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
  // « Remplacer ce qui est déjà saisi » : coché pour la plage affichée seulement (décoché en changeant de soirée ou de semaine)
  const [replaceFor, setReplaceFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // soirée copiée en attente d'être collée, et soirées sur lesquelles elle a été collée depuis
  const clip = useSyncExternalStore(subscribeClip, readClip, () => null)
  const [pastedOn, setPastedOn] = useState<{ clip: string | null; days: string[] }>({ clip: null, days: [] })
  const pasted = clip && pastedOn.clip === clip ? pastedOn.days : []
  // publication en cours (créneaux ou émissions) : fiches traitées sur le total
  const [publishing, setPublishing] = useState<{ what: 'slots' | 'programs'; done: number; total: number } | null>(null)
  // émissions jamais publiées parmi celles des créneaux affichés : vérifiées à chaque nouvelle liste et après une publication
  const [offline, setOffline] = useState<{ key: string; programs: OfflineProgram[] }>({ key: '', programs: [] })
  const [checks, setChecks] = useState(0)

  // la liste s'ouvre toujours filtrée sur la semaine en cours (redirection côté serveur : src/proxy.ts)
  const where = query?.where as Where | undefined
  const range = rangeFromWhere(where)
  const rangeKey = range ? `${range.first}/${range.days}` : ''
  const replace = replaceFor !== null && replaceFor === rangeKey
  const thisWeek = currentMonday()
  // soirée en cours ou à venir : jusqu'à 0 h 30, celle de la veille
  const tonight = tvDay()
  const total = isTransitioning ? undefined : data?.totalDocs
  const offAir = isTransitioning ? 0 : countOffAir(data?.docs)
  const pending = unpublishedSlots(isTransitioning ? [] : data?.docs)
  const toPublish = pending.slots.length
  const idsKey = programIds(isTransitioning ? [] : data?.docs).join(',')
  useEffect(() => {
    if (!idsKey) return
    const controller = new AbortController()
    findOfflinePrograms(routes.api, idsKey.split(',').map(Number), controller.signal)
      .then((programs) => setOffline({ key: idsKey, programs }))
      .catch(() => {})
    return () => controller.abort()
  }, [idsKey, checks, routes.api])
  const offlinePrograms = idsKey && offline.key === idsKey ? offline.programs : []

  const show = (first: string, days: 1 | 7) => refineListData({ where: rangeWhere(first, days), page: 1 })

  /** Demande de recopie ou de collage (POST /api/schedule/copy-week) ; null si elle a échoué, message d'erreur affiché. */
  const requestCopy = async (body: object, failed: string): Promise<CopyAnswer | null> => {
    try {
      const res = await fetch(`${routes.api}/schedule/copy-week`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as CopyAnswer
      if (!res.ok) {
        toast.error(json.error || `${failed}. Réessayez dans un instant.`)
        return null
      }
      return json
    } catch {
      toast.error(`${failed} (connexion interrompue ?). Réessayez dans un instant.`)
      return null
    }
  }

  /** Recopie la plage [first, first + days) sept jours plus tard, puis affiche la plage d'arrivée. */
  const copy = async (first: string, days: 1 | 7) => {
    const target = shiftDay(first, 7)
    const warning = replace ? `\n\nCe qui est déjà saisi sur la ${rangeLabel(target, days)} sera effacé.` : ''
    // la recopie reprend ce qui est en ligne : un brouillon jamais publié n'est pas recopié, une modification non publiée non plus
    const drafts =
      toPublish && first === range?.first
        ? `\n\nAttention : ${plural(toPublish, 'créneau est', 'créneaux sont')} à publier. Seule la version en ligne est recopiée : publiez-${toPublish > 1 ? 'les' : 'le'} d’abord.`
        : ''
    if (!window.confirm(`Recopier tous les créneaux de la ${rangeLabel(first, days)} sur la ${rangeLabel(target, days)} ?${warning}${drafts}`)) return
    setBusy(true)
    try {
      const json = await requestCopy({ from: first, days, replace }, 'La copie a échoué')
      if (!json) return
      toast.success(`${plural(json.copied ?? 0, 'créneau recopié', 'créneaux recopiés')} sur la ${rangeLabel(target, days)}.${skippedNote(json.skipped)}`)
      setReplaceFor(null)
      if (range && target === range.first && days === range.days) router.refresh()
      else await show(target, days)
    } finally {
      setBusy(false)
    }
  }

  /** « Copier cette soirée » : gardée pour être collée ensuite sur d'autres soirées, de cette semaine ou d'une autre. */
  const copyEvening = (evening: string) => {
    // seule la version en ligne est collée : un brouillon jamais publié ne l'est pas, une modification non publiée non plus
    const drafts = `Attention : ${plural(toPublish, 'créneau de cette soirée est', 'créneaux de cette soirée sont')} à publier. Seule la version en ligne sera collée : publiez-${toPublish > 1 ? 'les' : 'le'} d’abord.\n\nCopier quand même ?`
    if (toPublish && !window.confirm(drafts)) return
    storeClip(evening)
    setPastedOn({ clip: evening, days: [] })
  }

  /** Abandonne la soirée copiée (« Annuler la copie », ou « Terminer » après l'avoir collée). */
  const clearClip = () => {
    storeClip(null)
    setPastedOn({ clip: null, days: [] })
  }

  /** « Coller sur le … » : la soirée copiée est recopiée sur la soirée affichée, aux mêmes heures, directement en ligne. */
  const paste = async (from: string, to: string) => {
    const warning = replace ? `\n\nCe qui est déjà saisi sur la soirée du ${dayLabel(to)} sera effacé.` : ''
    if (!window.confirm(`Coller tous les créneaux de la soirée du ${dayLabel(from)} sur la soirée du ${dayLabel(to)} ? Ils seront aussitôt en ligne.${warning}`)) return
    setBusy(true)
    try {
      const json = await requestCopy({ from, days: 1, to, replace }, 'Le collage a échoué')
      if (!json) return
      toast.success(`${plural(json.copied ?? 0, 'créneau collé', 'créneaux collés')} sur la soirée du ${dayLabel(to)}.${skippedNote(json.skipped)}`)
      setReplaceFor(null)
      setPastedOn((p) => ({ clip: from, days: p.clip === from ? [...p.days.filter((d) => d !== to), to] : [to] }))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  /** Publie d'un clic les créneaux restés en brouillon de la liste affichée, puis la recharge. */
  const publish = async (slots: PendingSlot[]) => {
    const n = slots.length
    if (!window.confirm(`Publier ${n > 1 ? `ces ${n} créneaux` : 'ce créneau'} ? ${n > 1 ? 'Ils apparaîtront' : 'Il apparaîtra'} aussitôt dans le programme du site.`)) return
    setPublishing({ what: 'slots', done: 0, total: n })
    try {
      const result = await publishSlots(routes.api, slots, (done) => setPublishing({ what: 'slots', done, total: n }))
      if (result.published) {
        toast.success(`${plural(result.published, 'créneau publié', 'créneaux publiés')} : ${result.published > 1 ? 'ils sont' : 'il est'} maintenant dans le programme du site.`)
      }
      if (result.refused.length) {
        const r = result.refused.length
        toast.error(`${plural(r, 'créneau refusé', 'créneaux refusés')} : ${result.refused.join(' · ')}. Corrigez-${r > 1 ? 'les' : 'le'}, puis publiez à nouveau.`)
      }
      if (result.interrupted) {
        toast.error(`Connexion interrompue : ${plural(result.interrupted, 'créneau n’a pas été publié', 'créneaux n’ont pas été publiés')}. Réessayez dans un instant.`)
      }
      router.refresh()
    } finally {
      setPublishing(null)
    }
  }

  /** Publie d'un clic les émissions jamais publiées des créneaux affichés, puis vérifie à nouveau et recharge la liste. */
  const publishOffline = async (programs: OfflineProgram[]) => {
    const n = programs.length
    const question = n > 1 ? `Publier ces ${n} émissions ? Leur nom apparaîtra aussitôt sur le site.` : `Publier l’émission ${programName(programs[0])} ? Son nom apparaîtra aussitôt sur le site.`
    if (!window.confirm(question)) return
    setPublishing({ what: 'programs', done: 0, total: n })
    try {
      const result = await publishPrograms(routes.api, programs, (done) => setPublishing({ what: 'programs', done, total: n }))
      if (result.published) {
        toast.success(`${plural(result.published, 'émission publiée', 'émissions publiées')} : ${result.published > 1 ? 'leur nom apparaît' : 'son nom apparaît'} maintenant sur le site.`)
      }
      if (result.refused.length) {
        const r = result.refused.length
        toast.error(`${plural(r, 'émission refusée', 'émissions refusées')} : ${result.refused.join(' · ')}. Ouvrez-${r > 1 ? 'les' : 'la'} pour ${r > 1 ? 'les' : 'la'} compléter, puis publiez.`)
      }
      if (result.interrupted) {
        toast.error(`Connexion interrompue : ${plural(result.interrupted, 'émission n’a pas été publiée', 'émissions n’ont pas été publiées')}. Réessayez dans un instant.`)
      }
      setChecks((c) => c + 1)
      router.refresh()
    } finally {
      setPublishing(null)
    }
  }

  const notice = offlinePrograms.length > 0 ? offlineProgramsNotice(offlinePrograms) : null
  const offlineBanner = notice && (
    <div className="sw-week__drafts sw-week__drafts--programs">
      <p role="status">
        <strong>{notice.title}</strong>
        {notice.rest}
      </p>
      <Button buttonStyle="primary" size="small" margin={false} disabled={publishing !== null || busy} onClick={() => void publishOffline(offlinePrograms)}>
        {publishing?.what === 'programs'
          ? `Publication… ${publishing.done}/${publishing.total}`
          : offlinePrograms.length > 1
            ? `Publier les ${offlinePrograms.length} émissions`
            : 'Publier l’émission'}
      </Button>
    </div>
  )

  const publishBanner = toPublish > 0 && (
    <div className="sw-week__drafts">
      <p role="status">
        <strong>{plural(toPublish, 'créneau', 'créneaux')} à publier</strong> ({unpublishedDetail(pending.draft, pending.changed)}),{' '}
        {toPublish > 1 ? 'signalés' : 'signalé'} dans la liste. Un créneau saisi ou modifié reste un brouillon tant qu’on n’a pas cliqué sur « Publier les
        modifications ».
      </p>
      <Button buttonStyle="primary" size="small" margin={false} disabled={publishing !== null || busy} onClick={() => void publish(pending.slots)}>
        {publishing?.what === 'slots' ? `Publication… ${publishing.done}/${publishing.total}` : toPublish > 1 ? `Publier les ${toPublish} créneaux` : 'Publier ce créneau'}
      </Button>
    </div>
  )

  const hours = (
    <p className="sw-week__hours">
      <AdminIcon name="tv" className="sw-week__hours-icon" />
      <span>
        <strong>Antenne : tous les jours de 18 h à 0 h 30.</strong> Les créneaux de 0 h à 0 h 30 se saisissent à la date du lendemain et comptent dans
        la soirée de la veille.
      </span>
    </p>
  )

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
        {hours}
        {offlineBanner}
        {publishBanner}
      </div>
    )
  }

  const monday = range.days === 7 ? range.first : mondayOf(range.first)
  const day = range.days === 1 ? range.first : null
  const empty = total === 0
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
  // collage possible sur la soirée affichée : une autre que celle copiée, pas encore collée ici, liste à jour (total connu)
  const pastedHere = day !== null && pasted.includes(day)
  const canPaste = clip !== null && day !== null && day !== clip && !pastedHere && total !== undefined

  return (
    <div className="sw-week">
      <div className="sw-week__bar">
        <div>
          <p className="sw-week__title">{capitalize(weekEveningsLabel(monday))}</p>
          <p className="sw-week__count">
            {monday === thisWeek ? 'Semaine en cours · ' : ''}
            {day ? `Soirée du ${dayLabel(day)} : ` : ''}
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

      {hours}

      <div className="sw-week__days" role="group" aria-label="Afficher une seule soirée">
        <button type="button" className="sw-day" aria-pressed={!day} onClick={() => void show(monday, 7)}>
          Toute la semaine
        </button>
        {weekDays.map((d) => {
          const chip = dateChip(parisDateTime(d, '12:00'))
          return (
            <button
              key={d}
              type="button"
              className="sw-day"
              aria-pressed={day === d}
              onClick={() => void show(d, 1)}
              aria-label={`Soirée du ${dayLabel(d)}${d === clip ? ' (copiée)' : ''}`}
            >
              {chip.weekday} {chip.day}
              {d === tonight && <span className="sw-day__today">ce soir</span>}
              {d === clip && <span className="sw-day__clip">copiée</span>}
            </button>
          )
        })}
      </div>

      {offlineBanner}
      {publishBanner}

      {offAir > 0 && (
        <p className="sw-week__offair" role="status">
          <strong>
            {plural(offAir, 'créneau', 'créneaux')} en dehors des horaires d’antenne ({BROADCAST_HOURS_LABEL})
          </strong>
          , {offAir > 1 ? 'signalés' : 'signalé'} « hors antenne » dans la liste : {offAir > 1 ? 'ils ne sont pas recopiés' : 'il n’est pas recopié'} et
          les visiteurs n’en voient au mieux que la partie entre 18 h et 0 h 30. Corrigez l’heure ou la durée, ou supprimez-{offAir > 1 ? 'les' : 'le'}.
        </p>
      )}

      {clip ? (
        // soirée copiée, en attente d'être collée : la boîte de collage remplace celle de la recopie
        <div className="sw-week__copy sw-week__copy--clip">
          <AdminIcon name="copy" className="sw-week__copy-icon" />
          <p role="status">
            <strong>Soirée du {dayLabel(clip)} copiée.</strong>{' '}
            {!day
              ? 'Choisissez ci-dessus le jour où la coller, ou changez de semaine.'
              : day === clip
                ? 'Ouvrez la soirée où la coller : un autre jour ci-dessus, ou d’une autre semaine.'
                : pastedHere
                  ? 'Elle est collée sur cette soirée. Ouvrez un autre jour pour la coller encore, ou cliquez sur « Terminer ».'
                  : total
                    ? `Cette soirée contient déjà ${plural(total, 'créneau', 'créneaux')} : cochez « Remplacer ce qui est déjà saisi » pour les remplacer par ceux de la soirée copiée.`
                    : 'Collez-la sur cette soirée : ses créneaux y seront recopiés aux mêmes heures, directement en ligne.'}
          </p>
          <div className="sw-week__copy-actions">
            {canPaste && (
              <>
                {total ? (
                  <label className="sw-week__replace" htmlFor={replaceId}>
                    <input id={replaceId} type="checkbox" checked={replace} onChange={(e) => setReplaceFor(e.target.checked ? rangeKey : null)} />
                    Remplacer ce qui est déjà saisi
                  </label>
                ) : null}
                <Button
                  buttonStyle="primary"
                  size="small"
                  margin={false}
                  disabled={busy || publishing !== null || ((total ?? 0) > 0 && !replace)}
                  onClick={() => void paste(clip, day)}
                >
                  {busy ? 'Collage en cours…' : `Coller sur le ${dayLabel(day)}`}
                </Button>
              </>
            )}
            <Button buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={clearClip}>
              {pasted.length ? 'Terminer' : 'Annuler la copie'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="sw-week__copy">
          <AdminIcon name="copy" className="sw-week__copy-icon" />
          {empty ? (
            <p>
              <strong>{day ? 'Cette soirée est vide.' : 'Cette semaine est vide.'}</strong> Gagnez du temps : reprenez le programme{' '}
              {day ? `du ${dayLabel(shiftDay(day, -7))}, ou copiez une autre soirée pour la coller ici` : 'de la semaine précédente'}, puis ajustez ce qui
              change.
            </p>
          ) : day ? (
            <p>
              <strong>Gagnez du temps :</strong> copiez cette soirée pour la coller sur un ou plusieurs autres jours, ou recopiez-la sur le même jour de la
              semaine suivante, puis ajustez seulement ce qui change.
            </p>
          ) : (
            <p>
              <strong>Gagnez du temps :</strong> recopiez cette semaine sur la suivante, puis ajustez seulement ce qui change. Pour copier une seule soirée sur
              un autre jour, choisissez-la ci-dessus.
            </p>
          )}
          <div className="sw-week__copy-actions">
            {empty ? (
              <Button buttonStyle="primary" size="small" margin={false} disabled={busy || publishing !== null} onClick={() => void copy(shiftDay(range.first, -7), range.days)}>
                {busy ? 'Copie en cours…' : day ? `Reprendre le ${dayLabel(shiftDay(day, -7))}` : 'Reprendre la semaine précédente'}
              </Button>
            ) : (
              <>
                {day && (
                  <Button buttonStyle="primary" size="small" margin={false} disabled={busy || publishing !== null || isTransitioning} onClick={() => copyEvening(day)}>
                    Copier cette soirée
                  </Button>
                )}
                <label className="sw-week__replace" htmlFor={replaceId}>
                  <input id={replaceId} type="checkbox" checked={replace} onChange={(e) => setReplaceFor(e.target.checked ? rangeKey : null)} />
                  Remplacer ce qui est déjà saisi
                </label>
                <Button
                  buttonStyle={day ? 'secondary' : 'primary'}
                  size="small"
                  margin={false}
                  disabled={busy || publishing !== null}
                  onClick={() => void copy(range.first, range.days)}
                >
                  {busy ? 'Copie en cours…' : day ? `Recopier sur le ${dayLabel(shiftDay(day, 7))}` : 'Recopier sur la semaine suivante'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleTools
