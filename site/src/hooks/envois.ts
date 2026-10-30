// Fichiers envoyés au serveur (médiathèque, jusqu'à 500 Mo) : écrits au fil de l'envoi dans un dossier temporaire
// (buildConfig.upload.useTempFiles), puis copiés dans la médiathèque. Payload ne supprime ce fichier temporaire qu'après
// une opération sur la médiathèque : un envoi refusé (connexion échouée, droits insuffisants) ou stocké sur S3 le laisse.
// D'où deux garde-fous : un gros envoi exige une personne de l'équipe connectée, et les fichiers oubliés sont effacés.
import { readdir, stat, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'

/** Dossier temporaire des envois (celui du système : /app n'est pas modifiable par le site dans Docker). */
export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'swatter-envois')

/** Au-delà de cette taille, un envoi multipart exige une personne de l'équipe connectée (formulaires de connexion : quelques Ko). */
export const ANONYMOUS_UPLOAD_MAX_BYTES = 1024 * 1024

/** Âge à partir duquel un fichier temporaire est oublié (un envoi dure au plus 30 min, voir http-timeouts.cjs). */
export const UPLOAD_TMP_MAX_AGE_MS = 2 * 3600_000

/**
 * Refus (401) d'un envoi multipart de plus de 1 Mo (ou de taille inconnue) sans compte de l'équipe : vérifié avant la
 * lecture du corps, qui n'est donc jamais écrit sur le disque. `user` : la personne connectée selon les en-têtes.
 * null : la requête peut passer.
 */
export async function refuseAnonymousUpload(request: Request, user: (headers: Headers) => Promise<{ collection?: string } | null>): Promise<Response | null> {
  if (!['POST', 'PATCH', 'PUT'].includes(request.method)) return null
  if (!request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) return null
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > 0 && length <= ANONYMOUS_UPLOAD_MAX_BYTES) return null
  try {
    if ((await user(request.headers))?.collection === 'users') return null
  } catch {
    // jeton illisible ou base injoignable : comme sans connexion
  }
  return Response.json({ errors: [{ message: 'Connectez-vous à l’administration pour envoyer un fichier.' }] }, { status: 401 })
}

/** Supprime les fichiers temporaires d'envoi plus vieux que `maxAge` ; renvoie leur nombre (jamais d'erreur). */
export async function purgeUploadTmp(dir = UPLOAD_TMP_DIR, maxAge = UPLOAD_TMP_MAX_AGE_MS, now = Date.now()): Promise<number> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    // dossier pas encore créé : rien à faire
    return 0
  }
  let removed = 0
  for (const name of names) {
    const file = path.join(dir, name)
    try {
      const info = await stat(file)
      if (info.isFile() && now - info.mtimeMs > maxAge) {
        await unlink(file)
        removed++
      }
    } catch {
      // supprimé entre-temps
    }
  }
  return removed
}

/** Ménage des fichiers temporaires au démarrage puis toutes les heures (sans retenir le processus : CLI, tests). */
export function startUploadTmpPurge(payload: Payload) {
  const run = () =>
    void purgeUploadTmp().then((removed) => {
      if (removed) payload.logger.info(`[swatter] ${removed} fichier(s) temporaire(s) d’envoi supprimé(s)`)
    })
  run()
  setInterval(run, 3600_000).unref()
}
