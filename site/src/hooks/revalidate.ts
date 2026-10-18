import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionSlug, GlobalAfterChangeHook, PayloadRequest } from 'payload'

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
 * pendant la saisie) ne touche pas la version en ligne, sauf « Dépublier », qui la retire du site.
 */
async function changesSite(doc: Versioned, previousDoc: Versioned, liveStatus: () => Promise<Versioned>): Promise<boolean> {
  if (doc?._status !== 'draft') return true
  if (previousDoc?._status !== 'published') return false
  return (await liveStatus())?._status === 'draft'
}

const liveDoc = (req: PayloadRequest, collection: CollectionSlug, id: number | string) => () =>
  req.payload.db.findOne({ collection, where: { id: { equals: id } }, req }) as Promise<Versioned>

export const revalidateAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req, collection }) => {
  if (await changesSite(doc, previousDoc, liveDoc(req, collection.slug, doc.id))) await revalidateAll(req.context)
  return doc
}

export const revalidateAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await revalidateAll(req.context)
  return doc
}

export const revalidateGlobal: GlobalAfterChangeHook = async ({ doc, previousDoc, req, global }) => {
  const live = () => req.payload.db.findGlobal({ slug: global.slug, req }) as Promise<Versioned>
  if (await changesSite(doc, previousDoc, live)) await revalidateAll(req.context)
  return doc
}

export const revalidateHooks = { afterChange: [revalidateAfterChange], afterDelete: [revalidateAfterDelete] }
