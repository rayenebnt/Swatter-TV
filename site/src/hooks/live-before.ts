import type { CollectionBeforeChangeHook, CollectionSlug, RequestContext } from 'payload'

/**
 * Version en ligne d'une fiche (ligne principale de la collection) juste avant son enregistrement. Dans les hooks
 * « afterChange », `previousDoc` est la dernière version, souvent un brouillon enregistré automatiquement pendant la saisie :
 * il ne dit ni si la fiche était sur le site, ni à quelle place du Top 10.
 */
export type LiveBefore = { _status?: 'draft' | 'published' | null; top10Rank?: number | null }

const KEY = 'liveBefore'
const keyOf = (collection: string, id: number | string) => `${collection}:${id}`

/** À placer dans les hooks « beforeChange » : retient la version en ligne avant une modification. */
export const recordLiveBefore: CollectionBeforeChangeHook = async ({ collection, data, operation, originalDoc, req }) => {
  const id = (originalDoc as { id?: number | string } | undefined)?.id
  if (operation !== 'update' || id === undefined) return data
  const live = (await req.payload.db.findOne({ collection: collection.slug, where: { id: { equals: id } }, req })) as LiveBefore | null
  const records = (req.context[KEY] ?? {}) as Record<string, LiveBefore | null>
  records[keyOf(collection.slug, id)] = live
  req.context[KEY] = records
  return data
}

/** Version en ligne retenue avant l'enregistrement de cette fiche ; undefined si rien n'a été retenu (création…). */
export function liveBefore(context: RequestContext | undefined, collection: CollectionSlug, id: number | string): LiveBefore | null | undefined {
  return (context?.[KEY] as Record<string, LiveBefore | null> | undefined)?.[keyOf(collection, id)]
}
