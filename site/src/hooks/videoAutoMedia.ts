// Couverture et aperçu animé tirés automatiquement de la vidéo (vidéos et replays), à chaque enregistrement :
// - YouTube : image de la vidéo (youtube-<id>) et diaporama animé de ses 3 images (ffmpeg) ;
// - fichier envoyé ou lien direct MP4 / HLS : image représentative et extrait muet de 5 s (ffmpeg, voir ./ffmpeg) ;
// - Bunny Stream : son image, si l'hôte de la zone de diffusion est connu (BUNNY_CDN_HOST), sans aperçu.
// Les fichiers créés sont reconnaissables à leur nom : youtube-<id>, video-<clé>, bunny-<id> (couvertures), apercu-<clé>
// (aperçus) et fond-m<n°> (vidéo de fond du carrousel de l'accueil, version légère d'un fichier envoyé), où la clé désigne
// la vidéo (y<id YouTube>, m<n° du fichier>, u<empreinte du lien>). Une image choisie à la main
// (ou un aperçu fourni par l'API) n'est jamais remplacée. Le hook ne lève jamais d'erreur : en cas d'échec, la fiche est enregistrée sans couverture ni aperçu.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createLocalReq, type CollectionAfterChangeHook, type CollectionBeforeValidateHook, type GlobalAfterChangeHook, type GlobalBeforeValidateHook, type Payload, type PayloadRequest } from 'payload'
import { youtubeId } from '@/lib/video'
import type { Media } from '@/payload-types'
import { backgroundClip, ffmpegReady, MissingProgramError, probeVideo, resetFfmpegState, slideshow, videoClip, videoCover, type VideoInput, type VideoProbe } from './ffmpeg'
import { TOP10_REORDER } from './top10'

type Data = Record<string, unknown>
type Source = { provider?: string | null; youtubeUrl?: string | null; bunnyVideoId?: string | null; url?: string | null; file?: unknown } | null | undefined

/** Adresse des images YouTube (remplaçable pour les tests, sans accès à Internet). */
const thumbBase = () => (process.env.YOUTUBE_THUMB_BASE || 'https://i.ytimg.com/vi').replace(/\/+$/, '')
/** Hôte de la zone de diffusion Bunny Stream (« vz-xxxx.b-cdn.net ») ; vide : pas d'image automatique pour Bunny. */
const bunnyHost = () => (process.env.BUNNY_CDN_HOST || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')

/** Pas de nouvel essai d'une couverture ou d'un aperçu en échec avant 10 min (enregistrement automatique toutes les ~300 ms). */
export const RETRY_AFTER_MS = 10 * 60_000

/** Sources dont la couverture est tirée automatiquement de la vidéo (pour Bunny Stream, elle reste à fournir). */
export const AUTO_COVER_PROVIDERS = ['youtube', 'upload', 'url']

/** Numéro d'un document lié (numéro seul ou document chargé) ; null : aucun. */
function idOf(value: unknown): number | string | null {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' || (typeof id === 'string' && id !== '') ? id : null
}

/** Lien direct lisible par le serveur : http ou https seulement (jamais file:, ftp:…) ; null sinon. */
export function remoteUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * Clé de la vidéo : « y » + identifiant YouTube, « m » + numéro du fichier de la médiathèque, « u » + empreinte du lien
 * direct (12 caractères), « b » + identifiant Bunny (si BUNNY_CDN_HOST est renseigné) ; null : rien d'automatique.
 */
export function autoKey(source: Source): string | null {
  switch (source?.provider) {
    case 'youtube': {
      const id = typeof source.youtubeUrl === 'string' ? youtubeId(source.youtubeUrl.trim()) : null
      return id ? `y${id}` : null
    }
    case 'upload': {
      const id = idOf(source.file)
      return id !== null && /^\d+$/.test(String(id)) ? `m${id}` : null
    }
    case 'url': {
      const url = remoteUrl(source.url)
      return url ? `u${createHash('sha1').update(url).digest('hex').slice(0, 12)}` : null
    }
    case 'bunny': {
      const id = source.bunnyVideoId?.trim()
      return id && /^[\w-]{1,64}$/.test(id) && bunnyHost() ? `b${id}` : null
    }
    default:
      return null
  }
}

/** Nom (sans extension) de la couverture automatique d'une vidéo. */
export function coverBase(key: string): string {
  return key[0] === 'y' ? `youtube-${key.slice(1)}` : key[0] === 'b' ? `bunny-${key.slice(1)}` : `video-${key}`
}

/** Nom (sans extension) de l'aperçu animé d'une vidéo ; null : pas d'aperçu (Bunny Stream). */
export function previewBase(key: string): string | null {
  return key[0] === 'b' ? null : `apercu-${key}`
}

/** Nom (sans extension) de la vidéo de fond du carrousel tirée d'un fichier de la médiathèque (numéro `id`). */
export function backgroundBase(id: number | string): string {
  return `fond-m${id}`
}

const AUTO_NAME = /^(?:youtube-[\w-]{11}|video-(?:m\d+|u[0-9a-f]{12})|bunny-[\w-]{1,64}|apercu-(?:y[\w-]{11}|m\d+|u[0-9a-f]{12})|fond-m\d+)(?:-\d+)?\.\w+$/

/** Fichier de la médiathèque créé automatiquement (couverture ou aperçu), reconnu à son nom. */
export function isAutoFilename(filename: string): boolean {
  return AUTO_NAME.test(filename)
}

/** Fichier nommé `base` (« -1 », « -2 »… ajoutés par la médiathèque en cas de doublon), quelle que soit l'extension. */
export function hasBase(filename: string, base: string): boolean {
  return new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?\\.\\w+$`).test(filename)
}

// ---------- Téléchargements (YouTube, Bunny) ----------

/** Image téléchargée (délai de `timeout` ms) si elle dépasse `minBytes` : l'image grise « indisponible » de YouTube est minuscule. */
async function download(url: string, minBytes: number, timeout = 5000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!res.ok) return null
    const file = Buffer.from(await res.arrayBuffer())
    return file.length > minBytes ? file : null
  } catch {
    // injoignable ou trop lent
    return null
  }
}

/** Image la plus grande disponible : « maxresdefault » n'existe que pour les vidéos en HD. */
async function downloadThumbnail(id: string): Promise<Buffer | null> {
  for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const file = await download(`${thumbBase()}/${id}/${name}.jpg`, 2000)
    if (file) return file
  }
  return null
}

/**
 * Les 3 images que YouTube prend dans la vidéo, de la meilleure série complète : HD (maxres1-3), sinon sd1-3 (4:3 à
 * bandes noires, recadrées par le diaporama), sinon mq1-3 (320×180).
 */
async function downloadFrames(id: string): Promise<Buffer[] | null> {
  for (const [name, min] of [['maxres', 2000], ['sd', 2000], ['mq', 1000]] as const) {
    const files = await Promise.all([1, 2, 3].map((n) => download(`${thumbBase()}/${id}/${name}${n}.jpg`, min)))
    if (files.every((file): file is Buffer => file !== null)) return files
  }
  return null
}

// ---------- Échecs récents, programmes absents ----------

/** Échecs récents : nom du fichier automatique → date. */
const failures = new Map<string, number>()
/** Fichiers en cours de fabrication (deux enregistrements rapprochés de la même vidéo : un seul traitement). */
const inflight = new Map<string, Promise<Buffer | null>>()
/** Programmes absents déjà signalés dans le journal. */
const warned = new Set<string>()

/** Vidéos de fond en préparation (nom du fichier → traitement) : un seul par vidéo, quel que soit le nombre d'appels. */
const preparing = new Map<string, Promise<number | string | null>>()

/** Oublie les échecs récents et l'état de ffmpeg (tests). */
export function resetVideoAutoMedia() {
  failures.clear()
  inflight.clear()
  warned.clear()
  preparing.clear()
  resetFfmpegState()
}

/** Un seul avertissement par programme absent. */
function warnMissing(program: string, req: PayloadRequest) {
  if (warned.has(program)) return
  warned.add(program)
  req.payload.logger.warn(
    `[swatter] ${program} introuvable : pas de couverture tirée des fichiers vidéo ni des liens directs, ni d’aperçu animé. ` +
      'Installez ffmpeg sur le serveur (voir le Dockerfile) ou indiquez son emplacement (FFMPEG_PATH, FFPROBE_PATH).',
  )
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Fichier `name` fabriqué par `make` ; null en cas d'échec : avertissement (`failure`) dans le journal, puis aucun nouvel
 * essai pendant RETRY_AFTER_MS. Un programme absent n'est pas un échec de la vidéo (signalé une fois).
 */
function produce(name: string, make: () => Promise<Buffer | null>, failure: (reason: string | null) => string, req: PayloadRequest): Promise<Buffer | null> {
  const failedAt = failures.get(name)
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_MS) return Promise.resolve(null)
  const running = inflight.get(name)
  if (running) return running
  const job = (async () => {
    try {
      const file = await make()
      if (file) {
        failures.delete(name)
        return file
      }
      req.payload.logger.warn(failure(null))
    } catch (error) {
      if (error instanceof MissingProgramError) {
        warnMissing(error.program, req)
        return null
      }
      req.payload.logger.warn(failure(reasonOf(error)))
    }
    if (failures.size > 500) for (const [key, at] of failures) if (Date.now() - at >= RETRY_AFTER_MS) failures.delete(key)
    failures.set(name, Date.now())
    return null
  })().finally(() => inflight.delete(name))
  inflight.set(name, job)
  return job
}

// ---------- Fabrication selon la source ----------

/** Ce que l'on tire d'une vidéo : couverture, aperçu (absent pour Bunny), crédit des fichiers créés, messages d'échec. */
type Recipe = {
  credit: () => Promise<string | null>
  cover: () => Promise<Buffer | null>
  coverNeedsFfmpeg: boolean
  coverFailure: (reason: string | null) => string
  preview?: () => Promise<Buffer | null>
  previewFailure: (reason: string | null) => string
}

/**
 * Fichier vidéo de la médiathèque : sur le disque s'il y est, sinon par son adresse (stockage S3…). Une adresse du site
 * lui-même (/api/media/file/…) est lue directement sur le serveur local (port PORT), sans repasser par Internet.
 */
async function uploadedVideo(id: string, req: PayloadRequest): Promise<{ input: VideoInput; credit: string | null }> {
  const media = await req.payload.findByID({ collection: 'media', id: Number(id), depth: 0, req, disableErrors: true })
  if (!media?.filename) throw new Error('fichier introuvable dans la médiathèque')
  if (!media.mimeType?.startsWith('video/')) throw new Error('ce fichier n’est pas une vidéo')
  const credit = media.credit?.trim() || null
  const dir = path.resolve(process.env.MEDIA_DIR || 'media')
  const local = path.resolve(dir, media.filename)
  if (local.startsWith(dir + path.sep) && existsSync(local)) return { input: { path: local }, credit }
  if (!media.url) throw new Error('fichier introuvable')
  const site = (req.payload.config?.serverURL || '').replace(/\/+$/, '')
  const own = media.url.startsWith('/') ? media.url : site && media.url.startsWith(`${site}/`) ? media.url.slice(site.length) : null
  return { input: { url: own ? `http://127.0.0.1:${process.env.PORT || 3000}${own}` : media.url }, credit }
}

function recipe(key: string, source: NonNullable<Source>, req: PayloadRequest): Recipe {
  const id = key.slice(1)
  if (key[0] === 'y') {
    return {
      credit: async () => 'YouTube',
      cover: () => downloadThumbnail(id),
      coverNeedsFfmpeg: false,
      coverFailure: () => `[swatter] Image YouTube introuvable pour la vidéo ${id}`,
      preview: async () => {
        const frames = await downloadFrames(id)
        if (!frames) throw new Error('images de la vidéo introuvables sur YouTube')
        return slideshow(frames)
      },
      previewFailure: (reason) => `[swatter] Aperçu animé impossible pour la vidéo YouTube ${id} : ${reason}`,
    }
  }
  if (key[0] === 'b') {
    return {
      credit: async () => null,
      cover: () => download(`https://${bunnyHost()}/${id}/thumbnail.jpg`, 1000, 10_000),
      coverNeedsFfmpeg: false,
      coverFailure: () => `[swatter] Image Bunny Stream introuvable pour la vidéo ${id}`,
      previewFailure: () => '',
    }
  }
  // fichier envoyé ou lien direct : lu par ffmpeg (durée et dimensions lues une fois pour la couverture et l'aperçu)
  const label = key[0] === 'm' ? `fichier n° ${id} de la médiathèque` : String(remoteUrl(source.url)).slice(0, 160)
  let video: Promise<{ input: VideoInput; credit: string | null }> | undefined
  let probe: Promise<VideoProbe | null> | undefined
  const getVideo = () => (video ??= key[0] === 'm' ? uploadedVideo(id, req) : Promise.resolve({ input: { url: remoteUrl(source.url) as string }, credit: null }))
  // ffprobe absent : valeurs par défaut ; vidéo illisible : inutile de lancer ffmpeg, l'échec est le même
  const getProbe = () =>
    (probe ??= getVideo().then(({ input }) =>
      probeVideo(input).catch((error: unknown) => {
        if (!(error instanceof MissingProgramError)) throw error
        warnMissing(error.program, req)
        return null
      }),
    ))
  return {
    credit: async () => (await getVideo()).credit,
    cover: async () => videoCover((await getVideo()).input, await getProbe()),
    coverNeedsFfmpeg: true,
    coverFailure: (reason) => `[swatter] Couverture impossible à tirer de la vidéo (${label}) : ${reason ?? 'aucune image'}`,
    preview: async () => videoClip((await getVideo()).input, await getProbe()),
    previewFailure: (reason) => `[swatter] Aperçu animé impossible (${label}) : ${reason ?? 'aucune image'}`,
  }
}

// ---------- Médiathèque ----------

/** Fichiers de la médiathèque nommés `base` (« -1 », « -2 »… compris). */
async function findAllAuto(base: string, req: PayloadRequest): Promise<(number | string)[]> {
  const { docs } = await req.payload.find({
    collection: 'media',
    // « like » est approximatif (insensible à la casse, « _ » joker) : le nom exact est vérifié ensuite ; « base. » et
    // « base- » plutôt que « base » : video-m1 ne doit pas ramener video-m10, video-m11…
    where: { or: [{ filename: { like: `${base}.` } }, { filename: { like: `${base}-` } }] },
    limit: 10,
    depth: 0,
    req,
  })
  return docs.filter((m) => typeof m.filename === 'string' && hasBase(m.filename, base)).map((m) => m.id)
}

/** Fichier automatique `base` déjà dans la médiathèque (même vidéo en replay et dans « Vidéos », image retirée puis remise…). */
async function findAuto(base: string, req: PayloadRequest): Promise<number | string | null> {
  return (await findAllAuto(base, req))[0] ?? null
}

/** Fichier disparu de la médiathèque (supprimé pendant que le formulaire de la fiche restait ouvert). */
async function isGone(id: number | string, req: PayloadRequest): Promise<boolean> {
  return !(await req.payload.findByID({ collection: 'media', id, depth: 0, req, disableErrors: true }))
}

/**
 * Fichier lié à remplacer après un changement de vidéo : fichier automatique tiré d'une autre vidéo que `base`, ou
 * fichier disparu de la médiathèque. Un fichier choisi à la main (ou fourni par l'API) est gardé.
 */
async function isStale(id: number | string, base: string, req: PayloadRequest): Promise<boolean> {
  const media = await req.payload.findByID({ collection: 'media', id, depth: 0, req, disableErrors: true })
  if (!media) return true
  const filename = typeof media.filename === 'string' ? media.filename : ''
  return isAutoFilename(filename) && !hasBase(filename, base)
}

/** Nouveau document de la médiathèque (le fichier du formulaire en cours, req.file, est rendu ensuite). */
async function createMedia(req: PayloadRequest, file: Buffer, name: string, mimetype: string, alt: string, credit: string | null) {
  const before = req.file
  try {
    const media = await req.payload.create({
      collection: 'media',
      data: credit ? { alt, credit } : { alt },
      file: { data: file, mimetype, name, size: file.length },
      req,
    })
    return media.id
  } finally {
    req.file = before
  }
}

// ---------- Hook ----------

/** Source de la vidéo après l'enregistrement : celle du formulaire, complétée par la fiche enregistrée. */
function currentSource(data: Data, originalDoc: Data | undefined): Source {
  const incoming = data.source as Source | undefined
  if (incoming === undefined) return originalDoc?.source as Source
  if (incoming === null) return null
  return { ...((originalDoc?.source as object | null) ?? {}), ...incoming }
}

/** Même document lié (ou aucun des deux). */
const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '')

async function fillAutoMedia(data: Data, originalDoc: Data | undefined, req: PayloadRequest): Promise<Data> {
  const source = currentSource(data, originalDoc)
  const key = autoKey(source)
  // autre vidéo qu'avant (modification seulement : à la création, une image ou un aperçu fourni est gardé) : nouvelle
  // couverture et nouvel aperçu si les actuels étaient tirés de l'ancienne vidéo
  const changed = originalDoc !== undefined && key !== autoKey(originalDoc.source as Source)
  const thumbnail = idOf(data.thumbnail === undefined ? originalDoc?.thumbnail : data.thumbnail)
  const preview = idOf(data.preview === undefined ? originalDoc?.preview : data.preview)
  const changes: Data = {}

  // source sans aperçu possible (Bunny, lien vide, source inconnue) : plus d'aperçu ; la couverture reste telle quelle
  if ((!key || !previewBase(key)) && preview !== null) changes.preview = null

  if (key && source) {
    const coverBaseName = coverBase(key)
    const previewBaseName = previewBase(key)
    // même vidéo : un fichier lié différent de celui de la fiche enregistrée (formulaire resté ouvert pendant le
    // remplacement du fichier vidéo, qui a supprimé l'ancienne couverture) est vérifié, sinon l'écriture échouerait
    const replace = (id: number | string, stored: unknown, base: string) => (changed ? isStale(id, base, req) : !same(id, idOf(stored)) && isGone(id, req))
    const coverName = !thumbnail || (await replace(thumbnail, originalDoc?.thumbnail, coverBaseName)) ? coverBaseName : null
    const previewName = previewBaseName && (!preview || (await replace(preview, originalDoc?.preview, previewBaseName))) ? previewBaseName : null
    if (coverName || previewName) {
      const steps = recipe(key, source, req)
      const coverFound = coverName ? await findAuto(coverName, req) : null
      const previewFound = previewName ? await findAuto(previewName, req) : null
      const ready = (needed: boolean) => (needed ? ffmpegReady((program) => warnMissing(program, req)) : Promise.resolve(true))
      // couverture et aperçu fabriqués en même temps (la vidéo n'est lue qu'une fois par ffprobe)
      const [coverFile, previewFile] = await Promise.all([
        coverName && coverFound === null && (await ready(steps.coverNeedsFfmpeg)) ? produce(coverName, steps.cover, steps.coverFailure, req) : null,
        previewName && previewFound === null && steps.preview && (await ready(true)) ? produce(previewName, steps.preview, steps.previewFailure, req) : null,
      ])
      // créés l'un après l'autre : la médiathèque passe le fichier par la requête (req.file)
      const credit = coverFile || previewFile ? await steps.credit().catch(() => null) : null
      const title = String(data.title ?? originalDoc?.title ?? '').trim()
      const cover = coverFound ?? (coverFile ? await createMedia(req, coverFile, `${coverName}.jpg`, 'image/jpeg', title || 'Image de la vidéo', credit) : null)
      const clip = previewFound ?? (previewFile ? await createMedia(req, previewFile, `${previewName}.mp4`, 'video/mp4', title ? `Aperçu animé : ${title}` : 'Aperçu animé de la vidéo', credit) : null)
      // échec : l'image et l'aperçu tirés de l'ancienne vidéo sont retirés (visuel de remplacement du site) ; nouvel essai plus tard
      if (coverName && !same(cover, thumbnail)) changes.thumbnail = cover
      if (previewName && !same(clip, preview)) changes.preview = clip
    }
  }
  return Object.keys(changes).length ? { ...data, ...changes } : data
}

/**
 * Vidéo ou replay enregistré (y compris l'enregistrement automatique des brouillons et l'import de la chaîne YouTube) :
 * couverture tirée de la vidéo si l'image est vide (ou tirée d'une autre vidéo), et aperçu animé. Rien pendant un simple
 * décalage dans le Top 10. Jamais d'erreur : un échec laisse la fiche sans couverture ni aperçu (visuel de remplacement).
 */
export const videoAutoMedia: CollectionBeforeValidateHook = async ({ data, originalDoc, req, context }) => {
  if (!data || context?.[TOP10_REORDER]) return data
  try {
    return await fillAutoMedia(data, originalDoc, req)
  } catch (error) {
    req.payload.logger.warn(`[swatter] Couverture ou aperçu automatique impossible : ${reasonOf(error)}`)
    return data
  }
}

/** Bilan du rattrapage : fiches examinées, fiches complétées. */
export type CatchUpResult = { checked: number; updated: number }

/**
 * Rattrapage des vidéos et replays sans couverture ou sans aperçu (fiches antérieures à l'aperçu animé, vidéo injoignable
 * à l'enregistrement) : fichiers fabriqués comme à l'enregistrement, puis écrits directement dans la fiche
 * (payload.db.updateOne : ni nouvelle version ni hooks, donc un brouillon en cours reste intact ; l'administration
 * reprend ces fichiers, retrouvés par leur nom, au prochain enregistrement). Une image choisie à la main n'est jamais
 * touchée. Jamais d'erreur. Voir src/scripts/apercus-existants.ts.
 */
export async function catchUpAutoMedia(payload: Payload, onUpdate?: (line: string) => void): Promise<CatchUpResult> {
  const result: CatchUpResult = { checked: 0, updated: 0 }
  for (const collection of ['videos', 'replays'] as const) {
    const { docs } = await payload.find({
      collection,
      where: { and: [{ 'source.provider': { in: AUTO_COVER_PROVIDERS } }, { or: [{ thumbnail: { exists: false } }, { preview: { exists: false } }] }] },
      depth: 0,
      pagination: false,
      select: { title: true, source: true, thumbnail: true, preview: true },
    })
    for (const doc of docs as unknown as (Data & { id: number | string })[]) {
      result.checked++
      try {
        const req = await createLocalReq({}, payload)
        const next = await fillAutoMedia({ ...doc }, doc, req)
        const changes: Data = {}
        for (const field of ['thumbnail', 'preview']) if (!same(idOf(next[field]), idOf(doc[field]))) changes[field] = idOf(next[field])
        if (!Object.keys(changes).length) continue
        await payload.db.updateOne({ collection, id: doc.id, data: changes, req })
        result.updated++
        onUpdate?.(`${collection === 'videos' ? 'Vidéo' : 'Replay'} « ${String(doc.title ?? doc.id)} » : ${Object.keys(changes).map((f) => (f === 'thumbnail' ? 'image' : 'aperçu animé')).join(' et ')}`)
      } catch (error) {
        payload.logger.warn(`[swatter] Rattrapage impossible pour ${collection} n° ${doc.id} : ${reasonOf(error)}`)
      }
    }
  }
  return result
}

/**
 * Fichier vidéo de la médiathèque remplacé (même document, autre fichier) : sa couverture, son aperçu et sa vidéo de fond
 * automatiques (video-m<n°>, apercu-m<n°>, fond-m<n°>), tirés de l'ancien fichier, sont supprimés. Les fiches liées perdent ces fichiers (clé
 * étrangère ON DELETE SET NULL) et les retrouvent, tirés du nouveau fichier, à leur prochain enregistrement.
 */
export const purgeReplacedVideoMedia: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update' || !previousDoc) return doc
  const wasVideo = typeof previousDoc.mimeType === 'string' && previousDoc.mimeType.startsWith('video/')
  const replaced = previousDoc.filename !== doc.filename || previousDoc.filesize !== doc.filesize
  if (!wasVideo || !replaced || !/^\d+$/.test(String(doc.id))) return doc
  try {
    for (const base of [coverBase(`m${doc.id}`), previewBase(`m${doc.id}`) as string, backgroundBase(doc.id)]) {
      for (const id of await findAllAuto(base, req)) await req.payload.delete({ collection: 'media', id, req })
    }
  } catch (error) {
    req.payload.logger.warn(`[swatter] Couverture ou aperçu de l’ancien fichier n° ${doc.id} non supprimé : ${reasonOf(error)}`)
  }
  return doc
}

/** Image obligatoire seulement si elle ne peut pas être tirée de la vidéo (Bunny Stream). */
export const thumbnailUnlessAutomatic = (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
  const provider = (siblingData?.source as { provider?: string } | undefined)?.provider
  return value || (provider && AUTO_COVER_PROVIDERS.includes(provider)) ? true : 'Ajoutez une image : elle n’est pas tirée automatiquement d’une vidéo Bunny Stream.'
}

// ---------- Vidéo de fond du carrousel de l'accueil (src/globals/Settings.ts, diapositives) ----------

const isNumericId = (id: unknown): id is number | string => (typeof id === 'number' || typeof id === 'string') && /^\d+$/.test(String(id))

/** Version légère déjà prête de la vidéo de fond tirée du fichier `id` de la médiathèque ; null : pas encore (ou jamais). */
export async function findBackgroundVideo(payload: Payload, id: number | string): Promise<Media | null> {
  if (!isNumericId(id)) return null
  const base = backgroundBase(id)
  const { docs } = await payload.find({
    collection: 'media',
    where: { or: [{ filename: { like: `${base}.` } }, { filename: { like: `${base}-` } }] },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  return docs.find((m) => typeof m.filename === 'string' && hasBase(m.filename, base)) ?? null
}

/**
 * Version légère de la vidéo de fond (fond-m<n°>.mp4 : 20 s au plus, 1920 × 1080 au plus, sans le son, voir
 * backgroundClip) tirée du fichier `id` de la médiathèque : la fabrique si elle manque, hors de toute requête (traitement
 * de plusieurs secondes, lancé sans être attendu après l'enregistrement des réglages ou au rendu de l'accueil). Un seul
 * traitement par vidéo à la fois ; en cas d'échec (vidéo illisible, ffmpeg absent), aucun nouvel essai avant
 * RETRY_AFTER_MS. Renvoie son numéro dans la médiathèque, ou null. Jamais d'erreur.
 */
export function prepareBackgroundVideo(payload: Payload, id: number | string): Promise<number | string | null> {
  if (!isNumericId(id)) return Promise.resolve(null)
  const base = backgroundBase(id)
  const running = preparing.get(base)
  if (running) return running
  const job = (async () => {
    const req = await createLocalReq({}, payload)
    const found = await findAuto(base, req)
    if (found !== null) return found
    if (!(await ffmpegReady((program) => warnMissing(program, req)))) return null
    let credit: string | null = null
    const file = await produce(
      base,
      async () => {
        const video = await uploadedVideo(String(id), req)
        credit = video.credit
        return backgroundClip(video.input)
      },
      (reason) => `[swatter] Vidéo de fond du carrousel impossible à préparer (fichier n° ${id} de la médiathèque) : ${reason ?? 'aucune image'}`,
      req,
    )
    if (!file) return null
    return createMedia(req, file, `${base}.mp4`, 'video/mp4', 'Vidéo de fond du carrousel (version légère)', credit)
  })()
    .catch((error: unknown) => {
      payload.logger?.warn(`[swatter] Vidéo de fond du carrousel impossible à préparer (fichier n° ${id}) : ${reasonOf(error)}`)
      return null
    })
    .finally(() => preparing.delete(base))
  preparing.set(base, job)
  return job
}

/**
 * État de la version légère de la vidéo de fond tirée du fichier `id` : en préparation, en échec récent (fichier illisible,
 * délai dépassé : nouvel essai RETRY_AFTER_MS après), ou ni l'un ni l'autre (prête, ou pas encore demandée). Mémoire du
 * serveur du site : tableau de bord.
 */
export function backgroundState(id: number | string): 'preparing' | 'failed' | null {
  const base = backgroundBase(id)
  if (preparing.has(base)) return 'preparing'
  const failedAt = failures.get(base)
  return failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_MS ? 'failed' : null
}

/** Vidéos de fond en cours de préparation (tests : attendre leur fin). */
export const backgroundVideosSettled = () => Promise.all([...preparing.values()])

/** Couverture tirée du fichier vidéo `id` de la médiathèque (video-m<n°>.jpg, la même que pour une vidéo du site) ; null en cas d'échec. */
async function coverFromUploadedVideo(id: number | string, alt: string, req: PayloadRequest): Promise<number | string | null> {
  const key = `m${id}`
  const base = coverBase(key)
  const found = await findAuto(base, req)
  if (found !== null) return found
  if (!(await ffmpegReady((program) => warnMissing(program, req)))) return null
  const steps = recipe(key, { provider: 'upload', file: id }, req)
  const file = await produce(base, steps.cover, steps.coverFailure, req)
  if (!file) return null
  const credit = await steps.credit().catch(() => null)
  return createMedia(req, file, `${base}.jpg`, 'image/jpeg', alt, credit)
}

type SlideRow = Record<string, unknown> & { id?: string | null; video?: unknown; image?: unknown; titleLine1?: unknown }

/**
 * Diapositives du carrousel avec une vidéo de fond (réglages, à chaque enregistrement, brouillons compris) : image de fond
 * tirée de la vidéo si elle est vide, ou si la vidéo a changé et que l'image était tirée d'une autre vidéo. Une image
 * choisie à la main est gardée. Jamais d'erreur : en cas d'échec, l'image reste vide (le site affiche son visuel par défaut).
 */
export const heroSlidesAutoCover: GlobalBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const slides = (data as Data | undefined)?.heroSlides
  if (!Array.isArray(slides)) return data
  try {
    const before = new Map<string, SlideRow>()
    for (const row of ((originalDoc as Data | undefined)?.heroSlides as SlideRow[] | undefined) ?? []) if (row?.id) before.set(String(row.id), row)
    let touched = false
    const next: SlideRow[] = []
    for (const row of slides as SlideRow[]) {
      const video = idOf(row?.video)
      const image = idOf(row?.image)
      if (!row || video === null || !isNumericId(video)) {
        next.push(row)
        continue
      }
      const previous = row.id ? before.get(String(row.id)) : undefined
      const changed = previous !== undefined && !same(idOf(previous.video), video)
      const replace = image === null || (changed && (await isStale(image, coverBase(`m${video}`), req)))
      if (!replace) {
        next.push(row)
        continue
      }
      const title = typeof row.titleLine1 === 'string' && row.titleLine1.trim() ? row.titleLine1.trim() : 'Diapositive du carrousel'
      const cover = await coverFromUploadedVideo(video, `Image de la vidéo : ${title}`, req)
      if (cover !== null && !same(cover, image)) {
        next.push({ ...row, image: cover })
        touched = true
      } else next.push(row)
    }
    return touched ? { ...data, heroSlides: next } : data
  } catch (error) {
    req.payload.logger.warn(`[swatter] Image tirée de la vidéo de fond du carrousel impossible : ${reasonOf(error)}`)
    return data
  }
}

/** Numéros des vidéos de fond des diapositives (réglages). */
export function slideVideoIds(slides: unknown): string[] {
  if (!Array.isArray(slides)) return []
  return [...new Set(slides.map((row) => idOf((row as SlideRow | null)?.video)).filter(isNumericId).map(String))]
}

/**
 * Réglages enregistrés : version légère des vidéos de fond du carrousel préparée en arrière-plan (sans retarder
 * l'enregistrement ; les brouillons comptent, pour que l'aperçu la montre vite).
 */
export const heroSlidesPrepareVideos: GlobalAfterChangeHook = ({ doc, req }) => {
  for (const id of slideVideoIds((doc as Data | undefined)?.heroSlides)) void prepareBackgroundVideo(req.payload, id)
  return doc
}

/** Rattrapage (npm run apercus) : version légère des vidéos de fond des diapositives publiées. Renvoie le nombre préparé. */
export async function catchUpHeroVideos(payload: Payload, onUpdate?: (line: string) => void): Promise<number> {
  let prepared = 0
  try {
    const settings = await payload.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
    for (const id of slideVideoIds(settings.heroSlides)) {
      if (await findBackgroundVideo(payload, id)) continue
      if ((await prepareBackgroundVideo(payload, id)) !== null) {
        prepared++
        onUpdate?.(`Vidéo de fond du carrousel : version légère du fichier n° ${id} préparée`)
      }
    }
  } catch (error) {
    payload.logger.warn(`[swatter] Rattrapage des vidéos de fond impossible : ${reasonOf(error)}`)
  }
  return prepared
}

