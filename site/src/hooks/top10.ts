import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/** Nombre de places du Top 10. */
export const TOP10_SIZE = 10

/** Contexte des mises à jour faites par le réordonnancement : évite de le relancer en cascade. */
export const TOP10_REORDER = 'top10Reorder'

type Ranked = { id: number; rank: number }

/**
 * Nouvelles places des autres vidéos classées quand une vidéo libère la place `freed` et/ou prend la place `taken`,
 * comme dans une liste qu'on réordonne : les places occupées qui suivent la place libérée remontent d'un cran, puis
 * celles qui commencent à la place prise descendent d'un cran (au-delà de la 10e, la vidéo sort du Top 10).
 * Une place laissée vide (complétée automatiquement sur le site) arrête le décalage. Renvoie les seules places changées.
 */
export function reorderTop10(others: Ranked[], freed: number | null, taken: number | null): Map<number, number | null> {
  const place = new Map<number, number | null>(others.map((o) => [o.id, o.rank]))
  const at = (rank: number) => others.filter((o) => place.get(o.id) === rank)
  /** Vidéos des places occupées sans interruption à partir de `from`. */
  const block = (from: number) => {
    const found: Ranked[] = []
    for (let r = from; r <= TOP10_SIZE && at(r).length; r++) found.push(...at(r))
    return found
  }
  // place libérée (et pas encore occupée par une autre vidéo) : les suivantes remontent
  if (freed !== null && at(freed).length === 0) {
    for (const o of block(freed + 1)) place.set(o.id, (place.get(o.id) as number) - 1)
  }
  // place prise déjà occupée : cette vidéo et les suivantes descendent
  if (taken !== null && at(taken).length > 0) {
    for (const o of block(taken)) {
      const next = (place.get(o.id) as number) + 1
      place.set(o.id, next > TOP10_SIZE ? null : next)
    }
  }
  const changes = new Map<number, number | null>()
  for (const o of others) if (place.get(o.id) !== o.rank) changes.set(o.id, place.get(o.id) ?? null)
  return changes
}

/** Autres vidéos classées (la plus récemment modifiée d'abord en cas d'égalité, reste d'une ancienne saisie). */
async function otherRanked(req: PayloadRequest, id: number | string): Promise<Ranked[]> {
  const { docs } = await req.payload.find({
    collection: 'videos',
    where: { and: [{ top10Rank: { exists: true } }, { id: { not_equals: id } }] },
    sort: ['top10Rank', '-updatedAt'],
    pagination: false,
    depth: 0,
    select: { top10Rank: true },
    req,
  })
  return docs.flatMap((d) => (typeof d.top10Rank === 'number' ? [{ id: d.id, rank: d.top10Rank }] : []))
}

async function apply(req: PayloadRequest, changes: Map<number, number | null>) {
  if (!changes.size) return
  // Payload recopie `context` sur la requête partagée (createLocalReq) : sans cette restauration, « disableRevalidate »
  // empêcherait la régénération du site demandée par l'enregistrement principal
  const parentContext = req.context
  try {
    for (const [id, rank] of changes) {
      await req.payload.update({ collection: 'videos', id, data: { top10Rank: rank }, depth: 0, req, context: { [TOP10_REORDER]: true, disableRevalidate: true } })
    }
  } finally {
    req.context = parentContext
  }
}

/**
 * Top 10 sans doublon : une vidéo placée à une place déjà prise s'y installe et décale les suivantes ;
 * une vidéo qui change de place ou sort du classement laisse les suivantes remonter.
 */
export const top10AfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req, context }) => {
  if (context?.[TOP10_REORDER]) return doc
  const rank = typeof doc.top10Rank === 'number' ? doc.top10Rank : null
  const before = operation === 'update' && typeof previousDoc?.top10Rank === 'number' ? previousDoc.top10Rank : null
  const freed = before !== null && before !== rank ? before : null
  if (rank === null && freed === null) return doc
  await apply(req, reorderTop10(await otherRanked(req, doc.id), freed, rank))
  return doc
}

/** Vidéo classée supprimée : les suivantes remontent. */
export const top10AfterDelete: CollectionAfterDeleteHook = async ({ doc, req, context }) => {
  if (context?.[TOP10_REORDER] || typeof doc.top10Rank !== 'number') return doc
  await apply(req, reorderTop10(await otherRanked(req, doc.id), doc.top10Rank, null))
  return doc
}
