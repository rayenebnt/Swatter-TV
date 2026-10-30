// Fichiers envoyés au serveur (médiathèque, jusqu'à 500 Mo) : écrits au fil de l'envoi dans un dossier temporaire
// (buildConfig.upload.useTempFiles), puis copiés dans la médiathèque. Payload ne supprime ce fichier temporaire qu'après
// une opération sur la médiathèque : un envoi refusé (connexion échouée, droits insuffisants) ou stocké sur S3 le laisse.
// D'où deux garde-fous : un fichier (ou un gros envoi) exige une personne de l'équipe connectée, et les fichiers oubliés
// sont effacés.
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

const refused = () => Response.json({ errors: [{ message: 'Connectez-vous à l’administration pour envoyer un fichier.' }] }, { status: 401 })

/**
 * Le corps multipart contient-il une partie que Payload écrirait sur le disque ? busboy traite comme fichier toute
 * partie avec un nom de fichier (filename) ou un type (Content-Type) : les champs texte des formulaires (_payload de
 * l'administration) n'ont ni l'un ni l'autre. Seuls les en-têtes des parties sont lus.
 */
export function hasFilePart(body: Uint8Array, contentType: string): boolean {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  // corps illisible : prudence, traité comme un fichier
  if (!boundary) return true
  const text = Buffer.from(body).toString('latin1')
  return text
    .split(`--${boundary[1] ?? boundary[2]}`)
    .slice(1)
    .some((part) => {
      const end = part.indexOf('\r\n\r\n')
      const headers = end === -1 ? '' : part.slice(0, end)
      return /filename\*?\s*=/i.test(headers) || /(^|\r\n)\s*content-type\s*:/i.test(headers)
    })
}

/**
 * Envoi multipart (POST, PATCH, PUT) sans compte de l'équipe : refusé (401) s'il dépasse 1 Mo ou que sa taille est
 * inconnue (vérifié sur les en-têtes, avant la lecture du corps), ou s'il contient un fichier (corps de 1 Mo au plus,
 * lu en mémoire). Payload n'écrit ainsi jamais sur le disque un fichier envoyé par un inconnu. `user` : la personne
 * connectée selon les en-têtes. Renvoie la requête à transmettre (corps relu si besoin) ou le refus.
 */
export async function guardUpload(request: Request, user: (headers: Headers) => Promise<{ collection?: string } | null>): Promise<Request | Response> {
  if (!['POST', 'PATCH', 'PUT'].includes(request.method)) return request
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('multipart/form-data')) return request
  const team = async () => {
    try {
      return (await user(request.headers))?.collection === 'users'
    } catch {
      // jeton illisible ou base injoignable : comme sans connexion
      return false
    }
  }
  const length = Number(request.headers.get('content-length'))
  if (!(Number.isFinite(length) && length > 0 && length <= ANONYMOUS_UPLOAD_MAX_BYTES)) return (await team()) ? request : refused()
  const body = new Uint8Array(await request.arrayBuffer())
  if (hasFilePart(body, type) && !(await team())) return refused()
  return new Request(request, { body })
}

/** GraphQL n'accepte que du JSON : un envoi multipart y est refusé (415) avant que Payload n'écrive le fichier sur le disque. */
export function refuseGraphqlUpload(request: Request): Response | null {
  return /multipart\//i.test(request.headers.get('content-type') ?? '') ? Response.json({ errors: [{ message: 'Envoi de fichier impossible ici.' }] }, { status: 415 }) : null
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
