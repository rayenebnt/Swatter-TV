// Recopie d'une semaine (ou d'une journée) de la grille des programmes sur la semaine suivante
// (outil de la liste « Grille des programmes », voir src/components/admin/ScheduleTools.tsx).
import { commitTransaction, initTransaction, killTransaction, type Endpoint, type Payload, type PayloadRequest } from 'payload'
import { shiftDay } from '@/components/programme/model'
import { mondayOf, nextWeekSameTime, rangeLabel, rangeWhere } from './schedule-week'

type CopyResult = { copied: number; replaced: number; target: string }

class CopyWeekError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * Recopie les créneaux des journées [first, first + days) sept jours plus tard, à la même heure de Paris.
 * `replace` efface d'abord ce qui est déjà saisi sur la plage d'arrivée ; sinon, une plage d'arrivée non vide est refusée.
 */
async function copyRange(payload: Payload, req: PayloadRequest, first: string, days: number, replace: boolean): Promise<CopyResult> {
  const target = shiftDay(first, 7)
  const context = { disableRevalidate: true }
  const source = await payload.find({ collection: 'schedule', where: rangeWhere(first, days), sort: 'startsAt', pagination: false, depth: 0, req })
  if (source.docs.length === 0) throw new CopyWeekError(`La ${rangeLabel(first, days)} ne contient aucun créneau : il n’y a rien à recopier.`, 400)

  const existing = await payload.count({ collection: 'schedule', where: rangeWhere(target, days), req })
  if (existing.totalDocs > 0 && !replace) {
    throw new CopyWeekError(
      `La ${rangeLabel(target, days)} contient déjà ${existing.totalDocs} créneau${existing.totalDocs > 1 ? 'x' : ''}. Cochez « Remplacer ce qui est déjà saisi » pour les effacer avant la copie.`,
      409,
    )
  }

  // Tout ou rien : en cas d'erreur, aucun créneau n'est effacé ni créé
  const shouldCommit = await initTransaction(req)
  try {
    if (existing.totalDocs > 0) await payload.delete({ collection: 'schedule', where: rangeWhere(target, days), req, context })
    for (const slot of source.docs) {
      await payload.create({
        collection: 'schedule',
        data: {
          // en ligne aussitôt, comme la semaine recopiée
          _status: 'published',
          startsAt: nextWeekSameTime(slot.startsAt).toISOString(),
          durationMinutes: slot.durationMinutes,
          program: typeof slot.program === 'object' ? slot.program.id : slot.program,
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
  return { copied: source.docs.length, replaced: existing.totalDocs, target }
}

/**
 * POST /api/schedule/copy-week { from: 'AAAA-MM-JJ', days?: 7 | 1, replace?: boolean }
 * days = 7 (par défaut) : la semaine contenant `from` ; days = 1 : la seule journée `from`.
 */
export const copyWeekEndpoint: Endpoint = {
  path: '/copy-week',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ error: 'Connectez-vous pour modifier la grille.' }, { status: 401 })
    const body = ((await req.json?.().catch(() => null)) ?? {}) as { from?: unknown; days?: unknown; replace?: unknown }
    const from = typeof body.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.from) && !Number.isNaN(Date.parse(body.from)) ? body.from : null
    const days = body.days === 1 ? 1 : body.days === undefined || body.days === 7 ? 7 : null
    if (!from || !days) return Response.json({ error: 'Semaine ou journée manquante ou invalide.' }, { status: 400 })
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
      req.payload.logger.error({ err: error }, '[swatter] Échec de la recopie de la grille')
      return Response.json({ error: 'La copie a échoué : aucun créneau n’a été modifié. Réessayez dans un instant.' }, { status: 500 })
    }
  },
}
