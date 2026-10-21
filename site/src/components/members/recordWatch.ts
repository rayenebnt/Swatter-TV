// Historique de l'espace membres : signale au serveur qu'une vidéo ou un replay vient d'être lancé (membre connecté seulement).
import { hasMemberHint, notifyMemberChange } from '@/lib/members/browser'
import type { HistoryKind } from '@/lib/members/shared'

/** Contenu regardé : type et identifiant numérique du document. */
export type WatchRef = { kind: HistoryKind; id: number }

/**
 * Ajoute le contenu en tête de l'historique du membre. Sans effet hors connexion (cookie témoin absent) ;
 * keepalive : l'envoi aboutit même si le visiteur quitte la page aussitôt. Simple confort : les erreurs sont ignorées.
 */
export function recordWatch({ kind, id }: WatchRef): void {
  if (!hasMemberHint()) return
  fetch('/api/compte/historique', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, id }),
    credentials: 'same-origin',
    keepalive: true,
  })
    .then((res) => {
      // Session expirée : le serveur a effacé les cookies, l'en-tête repasse en « Se connecter »
      if (res.status === 401) notifyMemberChange()
    })
    .catch(() => {})
}
