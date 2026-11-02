// État de publication des créneaux de la grille, lu dans la liste de l'administration, et publication d'un clic des
// créneaux restés en brouillon et des émissions pas en ligne (outils de la liste : ScheduleTools.tsx ; badge :
// SlotTimeCell.tsx ; émissions : src/lib/schedule-programs.ts).
// La liste montre la dernière version de chaque créneau (brouillon compris) et Payload y ajoute `_displayStatus` :
// « draft » (jamais publié : les visiteurs ne le voient pas), « changed » (publié, puis modifié sans être republié : les
// visiteurs voient encore l'ancienne version), « published ». Un créneau enregistré automatiquement pendant la saisie
// reste un brouillon tant qu'on n'a pas cliqué sur « Publier les modifications ».
import { programIdOf, programName } from '@/lib/schedule-programs'
import { slotWhen } from '@/lib/schedule-week'

/** Créneau à publier : jamais publié (« draft ») ou modifié depuis sa publication (« changed ») ; null : en ligne. */
export type SlotPublication = 'draft' | 'changed' | null

export function slotPublication(row: unknown): SlotPublication {
  const { _displayStatus, _status } = (row ?? {}) as { _displayStatus?: unknown; _status?: unknown }
  const status = _displayStatus ?? _status
  return status === 'draft' ? 'draft' : status === 'changed' ? 'changed' : null
}

/** Créneau à publier, tel que la liste le montre (dernière version enregistrée). */
export type PendingSlot = { id: number | string; label?: string; startsAt?: string }

/** Créneaux à publier d'une liste, dans son ordre, et combien ne sont pas du tout en ligne ou seulement modifiés. */
export function unpublishedSlots(docs: unknown[] | undefined): { slots: PendingSlot[]; draft: number; changed: number } {
  const result = { slots: [] as PendingSlot[], draft: 0, changed: 0 }
  for (const doc of docs ?? []) {
    const state = slotPublication(doc)
    const { id, label, startsAt } = (doc ?? {}) as { id?: unknown; label?: unknown; startsAt?: unknown }
    if (!state || (typeof id !== 'number' && typeof id !== 'string')) continue
    result.slots.push({ id, label: typeof label === 'string' ? label : undefined, startsAt: typeof startsAt === 'string' ? startsAt : undefined })
    result[state]++
  }
  return result
}

/** Badge de la liste : texte court et explication (infobulle). */
export const PUBLICATION_BADGE: Record<'draft' | 'changed', { label: string; title: string }> = {
  draft: {
    label: 'pas en ligne',
    title: 'Ce créneau n’a jamais été publié : les visiteurs ne le voient pas. Ouvrez-le et cliquez sur « Publier les modifications », ou utilisez le bouton « Publier » au-dessus de la liste.',
  },
  changed: {
    label: 'modifié, à publier',
    title: 'Ce créneau a été modifié sans être republié : les visiteurs voient encore l’ancienne version. Ouvrez-le et cliquez sur « Publier les modifications », ou utilisez le bouton « Publier » au-dessus de la liste.',
  },
}

/**
 * Détail du bandeau « N créneaux à publier » : « jamais publiés : invisibles sur le site », « modifié sans être
 * republié : le site montre encore l’ancienne version », ou les deux, comptés.
 */
export function unpublishedDetail(draft: number, changed: number): string {
  const s = (n: number) => (n > 1 ? 's' : '')
  const never = (n: number) => `jamais publié${s(n)} : invisible${s(n)} sur le site`
  const edited = (n: number) => `modifié${s(n)} sans être republié${s(n)} : le site montre encore l’ancienne version`
  if (!changed) return never(draft)
  if (!draft) return edited(changed)
  return `${draft} ${never(draft)} ; ${changed} ${edited(changed)}`
}

/** Nom d'un créneau dans un message : « 02/11/2026 20:30 — Titre », sinon son jour et son heure, sinon son numéro. */
export function slotName(slot: PendingSlot): string {
  return slot.label || (slot.startsAt ? slotWhen(slot.startsAt) : '') || `Créneau n° ${slot.id}`
}

type PayloadErrorBody = { errors?: { message?: unknown; data?: { errors?: { label?: unknown; message?: unknown }[] } }[] }

/**
 * Raison d'un refus de Payload (réponse REST) : le détail des champs refusés (« Émission : Ce champ est requis. ») ou, à
 * défaut, le message général.
 */
export function refusalReason(body: unknown): string {
  const errors = (body as PayloadErrorBody | null)?.errors ?? []
  const details = errors.flatMap((e) => e.data?.errors ?? []).filter((e) => typeof e.message === 'string' && e.message)
  if (details.length) return details.map((e) => (typeof e.label === 'string' && e.label ? `${e.label} : ${e.message}` : String(e.message))).join(' ; ')
  const message = errors.find((e) => typeof e.message === 'string' && e.message)?.message
  return typeof message === 'string' ? message : 'publication refusée'
}

/** `refused` : fiches refusées, nommées avec la raison ; `interrupted` : fiches non tentées (connexion coupée). */
export type PublishResult = { published: number; refused: string[]; interrupted: number }

/**
 * Publie des fiches une à une, telles qu'enregistrées en dernier (brouillon compris) : PATCH { _status: 'published' },
 * comme « Publier les modifications ». Les contrôles s'appliquent (émission obligatoire et en ligne, horaires d'antenne…) :
 * une fiche refusée est nommée avec la raison, les autres sont publiées. Connexion coupée : arrêt, le reste est compté.
 * `onProgress` : nombre de fiches traitées.
 */
export async function publishLatest(
  api: string,
  collection: 'schedule' | 'programs',
  docs: { id: number | string; name: string }[],
  onProgress?: (done: number) => void,
  request: typeof fetch = fetch,
): Promise<PublishResult> {
  const result: PublishResult = { published: 0, refused: [], interrupted: 0 }
  for (const [index, doc] of docs.entries()) {
    let res: Response
    try {
      res = await request(`${api}/${collection}/${encodeURIComponent(String(doc.id))}?depth=0`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': 'fr' },
        body: JSON.stringify({ _status: 'published' }),
      })
    } catch {
      result.interrupted = docs.length - index
      break
    }
    if (res.ok) result.published++
    else result.refused.push(`${doc.name} : ${refusalReason(await res.json().catch(() => null))}`)
    onProgress?.(index + 1)
  }
  return result
}

/** Publie les créneaux à publier de la liste (publishLatest), nommés par leur jour et leur heure. */
export const publishSlots = (api: string, slots: PendingSlot[], onProgress?: (done: number) => void, request: typeof fetch = fetch) =>
  publishLatest(api, 'schedule', slots.map((slot) => ({ id: slot.id, name: slotName(slot) })), onProgress, request)

/** Émission jamais publiée (fiche en ligne vide) : numéro et nom saisi (dernière version, brouillon compris). */
export type OfflineProgram = { id: number; title: string | null }

/** Numéros des émissions des créneaux d'une liste, sans doublon, dans l'ordre. */
export function programIds(docs: unknown[] | undefined): number[] {
  const ids = (docs ?? []).map((doc) => programIdOf((doc as { program?: unknown } | null)?.program)).filter((id): id is number => id !== null)
  return [...new Set(ids)]
}

/**
 * Émissions jamais publiées parmi `ids` : fiche principale au statut « brouillon » et sans titre (vide depuis
 * « Ajouter » : le site affiche leurs créneaux sans nom ; une émission retirée du site garde son nom en ligne), avec le
 * nom saisi en dernier (version brouillon comprise). Requêtes de l'équipe connectée ; échec : aucune.
 */
export async function findOfflinePrograms(api: string, ids: number[], signal?: AbortSignal, request: typeof fetch = fetch): Promise<OfflineProgram[]> {
  if (!ids.length) return []
  const get = async (params: Record<string, string>) => {
    const res = await request(`${api}/programs?${new URLSearchParams({ depth: '0', limit: String(ids.length), ...params })}`, { credentials: 'include', signal })
    return res.ok ? (((await res.json()) as { docs?: { id: number; title?: string | null }[] }).docs ?? []) : []
  }
  const offline = (await get({ 'where[and][0][id][in]': ids.join(','), 'where[and][1][_status][equals]': 'draft' })).filter((p) => !p.title)
  if (!offline.length) return []
  const latest = await get({ draft: 'true', 'where[id][in]': offline.map((p) => p.id).join(',') })
  const titles = new Map(latest.map((p) => [p.id, p.title || null]))
  return offline.map((p) => ({ id: p.id, title: titles.get(p.id) ?? null }))
}

/** Publie des émissions (publishLatest), nommées par leur titre. */
export const publishPrograms = (api: string, programs: OfflineProgram[], onProgress?: (done: number) => void, request: typeof fetch = fetch) =>
  publishLatest(api, 'programs', programs.map((p) => ({ id: p.id, name: `Émission ${programName(p)}` })), onProgress, request)

/** Bandeau des émissions jamais publiées de la liste : titre (en gras) et suite du texte (ponctuation comprise). */
export function offlineProgramsNotice(programs: OfflineProgram[]): { title: string; rest: string } {
  if (programs.length === 1) {
    return {
      title: `L’émission ${programName(programs[0])} n’a jamais été publiée`,
      rest:
        ' : sur le site, ses créneaux s’affichent sans son nom (sous le titre « Programme ») et tout créneau qui l’utilise est refusé à la publication. Publiez-la ici d’un clic, ou ouvrez-la (Programme TV › Émissions) et cliquez sur « Publier les modifications ».',
    }
  }
  return {
    title: `${programs.length} émissions n’ont jamais été publiées`,
    rest: ` (${programs.map(programName).join(', ')}) : sur le site, leurs créneaux s’affichent sans leur nom (sous le titre « Programme ») et tout créneau qui les utilise est refusé à la publication. Publiez-les ici d’un clic, ou ouvrez-les (Programme TV › Émissions) et cliquez sur « Publier les modifications ».`,
  }
}
