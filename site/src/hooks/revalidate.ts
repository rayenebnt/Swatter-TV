import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionSlug, GlobalAfterChangeHook, PayloadRequest } from 'payload'
import { liveBefore, recordLiveBefore } from './live-before'

/**
 * Régénère les pages du site après une modification dans l'administration.
 * Sans effet hors d'une requête Next.js (scripts d'import, seed) ou si `context.disableRevalidate`.
 */
async function revalidateAll(context: Record<string, unknown> | undefined) {
  if (context?.disableRevalidate) return
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/', 'layout')
  } catch {
    // appelé hors du runtime Next.js : rien à faire
  }
}

type Versioned = { _status?: 'draft' | 'published' | null } | null | undefined

/**
 * La version visible sur le site a-t-elle changé ? Une publication, oui ; un brouillon (enregistrement automatique
 * pendant la saisie) ne touche pas la version en ligne, sauf « Retirer du site », qui la retire. `wasLive` : la fiche était
 * en ligne juste avant (version en ligne retenue par recordLiveBefore, à défaut `previousDoc`, la dernière version).
 */
async function changesSite(doc: Versioned, wasLive: boolean, liveStatus: () => Promise<Versioned>): Promise<boolean> {
  if (doc?._status !== 'draft') return true
  if (!wasLive) return false
  return (await liveStatus())?._status === 'draft'
}

const liveDoc = (req: PayloadRequest, collection: CollectionSlug, id: number | string) => () =>
  req.payload.db.findOne({ collection, where: { id: { equals: id } }, req }) as Promise<Versioned>

export const revalidateAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req, collection }) => {
  // une fiche en ligne qui a des modifications en attente a pour dernière version un brouillon : seule la version en ligne
  // retenue avant l'enregistrement dit si « Retirer du site » l'a retirée
  const before = liveBefore(req.context, collection.slug, doc.id)
  const wasLive = before !== undefined ? before?._status === 'published' : (previousDoc as Versioned)?._status === 'published'
  if (await changesSite(doc, wasLive, liveDoc(req, collection.slug, doc.id))) await revalidateAll(req.context)
  return doc
}

export const revalidateAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await revalidateAll(req.context)
  return doc
}

export const revalidateGlobal: GlobalAfterChangeHook = async ({ doc, previousDoc, req, global }) => {
  const live = () => req.payload.db.findGlobal({ slug: global.slug, req }) as Promise<Versioned>
  if (await changesSite(doc, (previousDoc as Versioned)?._status === 'published', live)) await revalidateAll(req.context)
  return doc
}

export const revalidateHooks = { beforeChange: [recordLiveBefore], afterChange: [revalidateAfterChange], afterDelete: [revalidateAfterDelete] }
