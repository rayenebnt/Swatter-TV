// Comptes jamais confirmés : une inscription dont le lien de confirmation n'a pas été ouvert (adresse mal saisie, robot,
// adresse d'un tiers) est supprimée au bout de 7 jours par la tâche horaire (voir /api/cron/import).
import type { Payload } from 'payload'

/** Délai avant suppression (le lien de confirmation, lui, expire au bout de 48 h et peut être renvoyé entre-temps). */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Supprime les membres non confirmés, inscrits il y a plus de 7 jours et qui ne se sont jamais connectés (un membre déjà
 * connecté une fois dont on aurait décoché « E-mail confirmé » dans l'administration n'est pas touché). Sont gardés aussi
 * les comptes suspendus (la suspension empêche de nouveaux e-mails vers une adresse inscrite par un tiers) et ceux dont un
 * lien de confirmation renvoyé récemment est encore valable. Renvoie leur nombre.
 */
export async function purgeUnverifiedMembers(payload: Payload, now = Date.now()): Promise<number> {
  const { docs } = await payload.delete({
    collection: 'members',
    where: {
      and: [
        { verified: { not_equals: true } },
        { blocked: { not_equals: true } },
        { lastLoginAt: { exists: false } },
        { createdAt: { less_than: new Date(now - KEEP_MS).toISOString() } },
        { or: [{ verifyTokenExpires: { exists: false } }, { verifyTokenExpires: { less_than: new Date(now).toISOString() } }] },
      ],
    },
    depth: 0,
    overrideAccess: true,
    context: { memberCounts: false },
  })
  return docs.length
}
