// Couverture et aperçu animé tirés automatiquement de la vidéo (vidéos et replays), à chaque enregistrement :
// - YouTube : image de la vidéo (youtube-<id>) et diaporama animé de ses 3 images (ffmpeg) ;
// - fichier envoyé ou lien direct MP4 / HLS : image représentative et extrait muet de 5 s (ffmpeg, voir ./ffmpeg) ;
// - Bunny Stream : son image, si l'hôte de la zone de diffusion est connu (BUNNY_CDN_HOST), sans aperçu.
// Les fichiers créés sont reconnaissables à leur nom : youtube-<id>, video-<clé>, bunny-<id> (couvertures) et apercu-<clé>
// (aperçus), où la clé désigne la vidéo (y<id YouTube>, m<n° du fichier>, u<empreinte du lien>). Une image choisie à la main
// n'est jamais remplacée. Le hook ne lève jamais d'erreur : en cas d'échec, la fiche est enregistrée sans couverture ni aperçu.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { CollectionBeforeValidateHook, PayloadRequest } from 'payload'
import { youtubeId } from '@/lib/video'
import { ffmpegReady, MissingProgramError, probeVideo, resetFfmpegState, slideshow, videoClip, videoCover, type VideoInput, type VideoProbe } from './ffmpeg'
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

const AUTO_NAME = /^(?:youtube-[\w-]{11}|video-(?:m\d+|u[0-9a-f]{12})|bunny-[\w-]{1,64}|apercu-(?:y[\w-]{11}|m\d+|u[0-9a-f]{12}))(?:-\d+)?\.\w+$/

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

/** Oublie les échecs récents et l'état de ffmpeg (tests). */
export function resetVideoAutoMedia() {
  failures.clear()
  inflight.clear()
  warned.clear()
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

/** Fichier automatique `base` déjà dans la médiathèque (même vidéo en replay et dans « Vidéos », image retirée puis remise…). */
async function findAuto(base: string, req: PayloadRequest): Promise<number | string | null> {
  const { docs } = await req.payload.find({
    collection: 'media',
    // « like » est approximatif (insensible à la casse, « _ » joker) : le nom exact est vérifié ensuite ; « base. » et
    // « base- » plutôt que « base » : video-m1 ne doit pas ramener video-m10, video-m11…
    where: { or: [{ filename: { like: `${base}.` } }, { filename: { like: `${base}-` } }] },
    limit: 10,
    depth: 0,
    req,
  })
  return docs.find((m) => typeof m.filename === 'string' && hasBase(m.filename, base))?.id ?? null
}

/** L'image actuelle est-elle un fichier automatique tiré d'une autre vidéo (donc à remplacer) ? */
async function isOtherAutoCover(thumbnail: number | string, key: string, req: PayloadRequest): Promise<boolean> {
  const media = await req.payload.findByID({ collection: 'media', id: thumbnail, depth: 0, req, disableErrors: true })
  const filename = typeof media?.filename === 'string' ? media.filename : ''
  return isAutoFilename(filename) && !hasBase(filename, coverBase(key))
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
  // autre vidéo qu'avant : nouvel aperçu, et nouvelle couverture si l'actuelle était tirée de l'ancienne vidéo
  const changed = key !== autoKey(originalDoc?.source as Source)
  const thumbnail = idOf(data.thumbnail === undefined ? originalDoc?.thumbnail : data.thumbnail)
  const preview = idOf(data.preview === undefined ? originalDoc?.preview : data.preview)
  const changes: Data = {}

  // source sans aperçu possible (Bunny, lien vide, source inconnue) : plus d'aperçu ; la couverture reste telle quelle
  if ((!key || !previewBase(key)) && preview !== null) changes.preview = null

  if (key && source) {
    const coverName = !thumbnail || (changed && (await isOtherAutoCover(thumbnail, key, req))) ? coverBase(key) : null
    const previewName = !preview || changed ? previewBase(key) : null
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
      // échec : l'image tirée de l'ancienne vidéo est retirée (visuel de remplacement du site) ; nouvel essai plus tard
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

/** Image obligatoire seulement si elle ne peut pas être tirée de la vidéo (Bunny Stream). */
export const thumbnailUnlessAutomatic = (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
  const provider = (siblingData?.source as { provider?: string } | undefined)?.provider
  return value || (provider && AUTO_COVER_PROVIDERS.includes(provider)) ? true : 'Ajoutez une image : elle n’est pas tirée automatiquement d’une vidéo Bunny Stream.'
}
