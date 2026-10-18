// Fiches vides abandonnées : avec l'enregistrement automatique, ouvrir « Ajouter » crée aussitôt un brouillon (c'est ce qui
// permet l'aperçu dès la première saisie). Celles qu'on quitte sans rien écrire sont supprimées par la tâche horaire.
import type { Payload } from 'payload'
import { DRAFT_COLLECTIONS } from './publication'

/** Délai avant suppression : une fiche ouverte puis laissée de côté quelques heures n'est pas touchée. */
const KEEP_MS = 24 * 60 * 60 * 1000

/**
 * Supprime les brouillons jamais publiés dont la dernière version n'a toujours pas de titre, modifiés il y a plus de 24 h.
 * Renvoie le nombre de fiches supprimées.
 */
export async function deleteEmptyDrafts(payload: Payload, now = Date.now()): Promise<number> {
  const before = new Date(now - KEEP_MS).toISOString()
  let deleted = 0
  for (const collection of DRAFT_COLLECTIONS) {
    // dernières versions (draft: true) toujours sans titre
    const { docs: untitled } = await payload.find({
      collection,
      draft: true,
      where: { and: [{ or: [{ title: { exists: false } }, { title: { equals: '' } }] }, { updatedAt: { less_than: before } }] },
      pagination: false,
      depth: 0,
      select: {},
    })
    if (!untitled.length) continue
    // dont la version en ligne est un brouillon…
    const { docs: offline } = await payload.find({
      collection,
      where: { and: [{ id: { in: untitled.map((d) => d.id) } }, { _status: { equals: 'draft' } }] },
      pagination: false,
      depth: 0,
      select: {},
    })
    for (const { id } of offline) {
      // … et qui n'ont jamais été publiées (un contenu retiré du site garde ses versions publiées)
      const published = await payload.countVersions({ collection, where: { and: [{ parent: { equals: id } }, { 'version._status': { equals: 'published' } }] } })
      if (published.totalDocs > 0) continue
      await payload.delete({ collection, id, context: { disableRevalidate: true } })
      deleted++
    }
  }
  return deleted
}
