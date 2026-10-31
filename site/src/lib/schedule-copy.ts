// Recopie d'une semaine (ou d'une soirée) de la grille des programmes sur la semaine suivante
// (outil de la liste « Grille des programmes », voir src/components/admin/ScheduleTools.tsx).
import { commitTransaction, initTransaction, killTransaction, ValidationError, type Endpoint, type Payload, type PayloadRequest } from 'payload'
import { shiftDay } from '@/components/programme/model'
import { BROADCAST_HOURS_LABEL, slotOutsideBroadcast } from './broadcast'
import { mondayOf, nextWeekSameTime, rangeLabel, rangeWhere } from './schedule-week'

/**
 * `copied` : créneaux recopiés ; `skipped` : anciens créneaux hors des horaires d'antenne (début avant 18 h ou à partir
 * de 0 h 30, ou fin après 0 h 30), laissés de côté ; `replaced` : créneaux effacés sur la plage d'arrivée.
 */
type CopyResult = { copied: number; skipped: number; replaced: number; target: string }

class CopyWeekError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const slots = (n: number) => `${n} créneau${n > 1 ? 'x' : ''}`

/**
 * Recopie les créneaux des soirées [first, first + days) sept jours plus tard, à la même heure de Paris.
 * `replace` efface d'abord ce qui est déjà saisi sur la plage d'arrivée ; sinon, une plage d'arrivée non vide est refusée.
 * Les anciens créneaux hors antenne (saisis avant les horaires 18 h – 0 h 30) ne sont pas recopiés, mais comptés : leur
 * copie serait refusée par le contrôle de la grille (src/collections/Schedule.ts) et ferait échouer toute la recopie.
 */
async function copyRange(payload: Payload, req: PayloadRequest, first: string, days: number, replace: boolean): Promise<CopyResult> {
  const target = shiftDay(first, 7)
  const context = { disableRevalidate: true }
  const source = await payload.find({ collection: 'schedule', where: rangeWhere(first, days), sort: 'startsAt', pagination: false, depth: 0, req })
  if (source.docs.length === 0) throw new CopyWeekError(`La ${rangeLabel(first, days)} ne contient aucun créneau : il n’y a rien à recopier.`, 400)
  const onAir = source.docs.filter((slot) => !slotOutsideBroadcast(new Date(slot.startsAt), slot.durationMinutes))
  const skipped = source.docs.length - onAir.length
  if (onAir.length === 0) {
    throw new CopyWeekError(
      `La ${rangeLabel(first, days)} ne contient ${skipped > 1 ? 'que des créneaux' : 'qu’un créneau'} en dehors des horaires d’antenne (${BROADCAST_HOURS_LABEL}) : il n’y a rien à recopier. Corrigez ${skipped > 1 ? 'leur heure ou leur durée' : 'son heure ou sa durée'}, ou supprimez-${skipped > 1 ? 'les' : 'le'}.`,
      400,
    )
  }

  const existing = await payload.count({ collection: 'schedule', where: rangeWhere(target, days), req })
  if (existing.totalDocs > 0 && !replace) {
    throw new CopyWeekError(
      `La ${rangeLabel(target, days)} contient déjà ${slots(existing.totalDocs)}. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.`,
      409,
    )
  }

  // Tout ou rien : en cas d'erreur, aucun créneau n'est effacé ni créé
  const shouldCommit = await initTransaction(req)
  try {
    if (existing.totalDocs > 0) await payload.delete({ collection: 'schedule', where: rangeWhere(target, days), req, context })
    for (const slot of onAir) {
      await payload.create({
        collection: 'schedule',
        data: {
          // en ligne aussitôt, comme la semaine recopiée
          _status: 'published',
          startsAt: nextWeekSameTime(slot.startsAt).toISOString(),
          durationMinutes: slot.durationMinutes,
          // émission supprimée depuis : null, refusé par le contrôle « Émission obligatoire » (400, voir plus bas)
          program: slot.program && typeof slot.program === 'object' ? slot.program.id : slot.program,
          titleOverride: slot.titleOverride,
        },
        req,
        context,
      })
    }
    if (shouldCommit) await commitTransaction(req)
  } catch (error) {
    if (shouldCommit) await killTransaction(req)
    throw error
  }
  return { copied: onAir.length, skipped, replaced: existing.totalDocs, target }
}

/**
 * Créneau refusé par les contrôles de la grille (émission supprimée depuis, par exemple) : la raison, en clair. Réessayer
 * n'y changerait rien, d'où un refus (400) plutôt qu'une panne (500).
 */
function validationMessage(error: ValidationError): string {
  const details = (error.data?.errors ?? []).map((e) => (typeof e.label === 'string' && e.label ? `${e.label} : ${e.message}` : e.message))
  return `Un créneau ne peut pas être recopié${details.length ? ` (${details.join(' ; ')})` : ''} : aucun créneau n’a été modifié. Corrigez-le dans la grille, puis recommencez.`
}

/** Jour AAAA-MM-JJ qui existe : « 2026-02-30 », que Date.parse accepte (2 mars), est refusé. */
function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * POST /api/schedule/copy-week { from: 'AAAA-MM-JJ', days?: 7 | 1, replace?: boolean }
 * days = 7 (par défaut) : la semaine contenant `from` ; days = 1 : la seule soirée `from`.
 */
export const copyWeekEndpoint: Endpoint = {
  path: '/copy-week',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ error: 'Connectez-vous pour modifier la grille.' }, { status: 401 })
    const body = ((await req.json?.().catch(() => null)) ?? {}) as { from?: unknown; days?: unknown; replace?: unknown }
    const from = isDay(body.from) ? body.from : null
    const days = body.days === 1 ? 1 : body.days === undefined || body.days === 7 ? 7 : null
    if (!from || !days) return Response.json({ error: 'Semaine ou soirée manquante ou invalide.' }, { status: 400 })
    try {
      const result = await copyRange(req.payload, req, days === 7 ? mondayOf(from) : from, days, body.replace === true)
      try {
        const { revalidatePath } = await import('next/cache')
        revalidatePath('/', 'layout')
      } catch {
        // hors runtime Next.js
      }
      return Response.json(result)
    } catch (error) {
      if (error instanceof CopyWeekError) return Response.json({ error: error.message }, { status: error.status })
      if (error instanceof ValidationError) return Response.json({ error: validationMessage(error) }, { status: 400 })
      req.payload.logger.error({ err: error }, '[swatter] Échec de la recopie de la grille')
      return Response.json({ error: 'La copie a échoué : aucun créneau n’a été modifié. Réessayez dans un instant.' }, { status: 500 })
    }
  },
}
