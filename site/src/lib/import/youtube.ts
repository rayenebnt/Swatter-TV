// Import des vidéos de la chaîne YouTube de Swatter TV (global « youtube »).
// Sans clé : flux RSS public de la chaîne (ses 15 dernières vidéos). Avec YOUTUBE_API_KEY : toute la chaîne (API YouTube).
// Appelé par GET /api/cron/import (toutes les heures), POST /api/youtube/import (bouton « Importer maintenant ») et
// src/scripts/import.ts. Chaque vidéo va dans une seule rubrique : les Shorts et vidéos courtes dans « Vidéos », les
// émissions longues dans « Replays » (rattachées à leur émission d'après le titre). Synchronisation : une vidéo lue sur la
// chaîne et absente du site y est (re)créée ; une vidéo « retirée du site » (brouillon) reste en place, donc pas recréée.
import { XMLParser } from 'fast-xml-parser'
import type { Payload } from 'payload'
import { foldText } from '@/components/search/text'
import { VIDEO_CATEGORIES } from '@/lib/categories'

export type YoutubeImportResult = {
  ok: boolean
  /** fiches créées (vidéos + replays) */
  created: number
  videos: number
  replays: number
  /** vidéos de la chaîne déjà présentes partout où elles doivent l'être */
  skipped: number
  /** vidéos lues sur la chaîne, et leurs identifiants YouTube */
  total: number
  ids: string[]
  error?: string
}

export type ChannelVideo = {
  id: string
  title: string
  description: string
  publishedAt: string | null
  /** durée en secondes (null : inconnue) */
  seconds: number | null
  /** Short YouTube (vidéo verticale de quelques secondes) */
  short: boolean
}

/** Adresses de YouTube (remplaçables pour les tests, sans accès à Internet). */
const siteBase = () => (process.env.YOUTUBE_BASE || 'https://www.youtube.com').replace(/\/+$/, '')
const apiBase = () => (process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/+$/, '')

const TIMEOUT_MS = 10_000
const TITLE_MAX = 200
const DESCRIPTION_MAX = 3000
/** Avec l'API : nombre maximal de vidéos lues par import (les plus récentes d'abord). */
const API_MAX_VIDEOS = 1000
/** Préférence « pas de bandeau de consentement » : sans elle, depuis l'Europe, youtube.com renvoie vers une page de choix. */
const HEADERS = { 'accept-language': 'fr-FR,fr;q=0.9', cookie: 'SOCS=CAI; CONSENT=YES+1', 'user-agent': 'Mozilla/5.0 (compatible; SwatterTV/1.0; +https://www.swatter-tv.fr)' }

const CHANNEL_ID = /^UC[\w-]{22}$/
const HANDLE = /^@[\w.-]{3,30}$/

/** Ce que désigne l'adresse saisie : un identifiant de chaîne (UC…), un pseudo (@…) ou une ancienne adresse /c/ ou /user/. */
export type ChannelRef = { id: string } | { handle: string } | { path: string }

/**
 * Chaîne d'après ce qu'on a collé : « https://www.youtube.com/@swattertv », « @swattertv », « https://www.youtube.com/channel/UC… »,
 * « UC… », « youtube.com/c/SwatterTV », « youtube.com/user/swattertv », ou l'adresse d'une page de la chaîne (/@swattertv/videos).
 */
export function parseChannel(input: string | null | undefined): ChannelRef | null {
  const raw = input?.trim()
  if (!raw) return null
  if (CHANNEL_ID.test(raw)) return { id: raw }
  if (HANDLE.test(raw)) return { handle: raw }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null
  let segments: string[]
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    // « %E0%A4%A » : adresse mal encodée, refusée comme toute adresse non reconnue (le champ affiche son message)
    return null
  }
  const [first, second] = segments
  if (!first) return null
  if (first === 'channel') return second && CHANNEL_ID.test(second) ? { id: second } : null
  if (HANDLE.test(first)) return { handle: first }
  if ((first === 'c' || first === 'user') && second && /^[\w.-]+$/.test(second)) return { path: `${first}/${second}` }
  return null
}

async function get(url: string): Promise<Response> {
  return fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
}

/** Identifiant de la chaîne (UC…) : donné tel quel, demandé à l'API, ou lu dans la page publique de la chaîne. */
export async function resolveChannelId(ref: ChannelRef, apiKey?: string): Promise<string> {
  if ('id' in ref) return ref.id
  if (apiKey && 'handle' in ref) {
    const res = await get(`${apiBase()}/channels?part=id&forHandle=${encodeURIComponent(ref.handle)}&key=${encodeURIComponent(apiKey)}`)
    const json = (await res.json().catch(() => null)) as { items?: { id?: string }[]; error?: { message?: string } } | null
    if (!res.ok) throw new Error(`API YouTube : ${json?.error?.message ?? `erreur ${res.status}`}`)
    const id = json?.items?.[0]?.id
    if (id && CHANNEL_ID.test(id)) return id
    throw new Error(`chaîne ${ref.handle} introuvable sur YouTube`)
  }
  const page = 'handle' in ref ? ref.handle : ref.path
  const res = await get(`${siteBase()}/${page}`)
  if (res.status === 404) throw new Error(`chaîne « ${page} » introuvable sur YouTube : vérifiez l’adresse`)
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status} pour la page de la chaîne`)
  const html = await res.text()
  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1]
  if (!id) throw new Error('identifiant de la chaîne introuvable dans sa page YouTube : collez plutôt l’adresse en /channel/UC…')
  return id
}

// ----- Flux RSS public (sans clé) -----

// parseTagValue: false : un titre « 007 » ou « true » reste du texte ; htmlEntities : « L&#39;été » devient « L'été »
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => name === 'entry', parseTagValue: false, htmlEntities: true })
type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null)
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : (obj(v)?.['#text'] as string | undefined) ?? '').trim()
const isoDate = (v: unknown): string | null => {
  const t = Date.parse(text(v))
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Vidéos d'un flux RSS de chaîne YouTube (fonction pure). */
export function parseChannelFeed(xml: string): ChannelVideo[] {
  const feed = obj(obj(parser.parse(xml))?.feed)
  if (!feed) throw new Error('flux YouTube illisible')
  return ((feed.entry as unknown[]) ?? []).flatMap((e) => {
    const entry = obj(e)
    const id = text(entry?.['yt:videoId'])
    const title = text(entry?.title)
    if (!entry || !/^[\w-]{11}$/.test(id) || !title) return []
    const group = obj(entry['media:group'])
    // le lien d'un Short mène à /shorts/…, celui d'une vidéo à /watch?v=…
    const links = (Array.isArray(entry.link) ? entry.link : [entry.link]).map((l) => String(obj(l)?.['@_href'] ?? ''))
    return [{ id, title, description: text(group?.['media:description']), publishedAt: isoDate(entry.published), seconds: null, short: links.some((h) => h.includes('/shorts/')) }]
  })
}

async function feedVideos(channelId: string): Promise<ChannelVideo[]> {
  const res = await get(`${siteBase()}/feeds/videos.xml?channel_id=${channelId}`)
  if (res.status === 404) throw new Error('flux de la chaîne introuvable : vérifiez l’adresse de la chaîne')
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status} pour le flux de la chaîne`)
  return parseChannelFeed(await res.text())
}

// ----- API YouTube (avec clé : toute la chaîne, durées comprises) -----

/** « PT1H2M3S » → 3723 (secondes), ou null. */
export function isoSeconds(iso: string | null | undefined): number | null {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const total = Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)
  return total > 0 ? total : null
}

/** Durée d'une vidéo : 245 → « 04:05 », 3723 → « 1:02:03 ». */
export function clockDuration(seconds: number | null): string | null {
  if (!seconds) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Durée d'un replay, comme dans la grille : 3120 → « 52 min », 4500 → « 1 h 15 ». */
export function minutesDuration(seconds: number | null): string | null {
  if (!seconds) return null
  const total = Math.max(1, Math.round(seconds / 60))
  const [h, m] = [Math.floor(total / 60), total % 60]
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${total} min`
}

/** Durée lue dans la page publique de la vidéo (sans clé d'API) ; null si elle est introuvable. */
export async function pageSeconds(id: string): Promise<number | null> {
  try {
    const res = await get(`${siteBase()}/watch?v=${id}`)
    if (!res.ok) return null
    const html = await res.text()
    const length = html.match(/"lengthSeconds":"(\d+)"/)?.[1]
    if (length) return Number(length) || null
    return isoSeconds(html.match(/<meta itemprop="duration" content="([^"]+)"/)?.[1])
  } catch {
    return null
  }
}

async function apiJson<T>(path: string, apiKey: string): Promise<T> {
  const res = await get(`${apiBase()}/${path}&key=${encodeURIComponent(apiKey)}`)
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null
  if (!res.ok || !json) throw new Error(`API YouTube : ${json?.error?.message ?? `erreur ${res.status}`}`)
  return json
}

async function apiVideos(channelId: string, apiKey: string): Promise<ChannelVideo[]> {
  // liste « Mises en ligne » de la chaîne : UC… → UU…
  const uploads = `UU${channelId.slice(2)}`
  type Page = { nextPageToken?: string; items?: { snippet?: { title?: string; description?: string; resourceId?: { videoId?: string } }; contentDetails?: { videoPublishedAt?: string } }[] }
  const videos: ChannelVideo[] = []
  let token: string | undefined
  do {
    const page = await apiJson<Page>(`playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${uploads}${token ? `&pageToken=${token}` : ''}`, apiKey)
    for (const item of page.items ?? []) {
      const id = item.snippet?.resourceId?.videoId ?? ''
      const title = item.snippet?.title?.trim() ?? ''
      // vidéos privées ou supprimées : titre « Private video » / « Deleted video », sans date de publication
      if (!/^[\w-]{11}$/.test(id) || !title || !item.contentDetails?.videoPublishedAt) continue
      videos.push({ id, title, description: item.snippet?.description?.trim() ?? '', publishedAt: isoDate(item.contentDetails.videoPublishedAt), seconds: null, short: false })
    }
    token = page.nextPageToken
  } while (token && videos.length < API_MAX_VIDEOS)

  // durées, par paquets de 50
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50)
    const json = await apiJson<{ items?: { id?: string; contentDetails?: { duration?: string } }[] }>(`videos?part=contentDetails&id=${batch.map((v) => v.id).join(',')}`, apiKey)
    const durations = new Map((json.items ?? []).map((v) => [v.id, isoSeconds(v.contentDetails?.duration)]))
    for (const v of batch) v.seconds = durations.get(v.id) ?? null
  }
  return videos
}

/** Vidéos de la chaîne, des plus récentes aux plus anciennes. */
export async function channelVideos(channelId: string, apiKey = process.env.YOUTUBE_API_KEY): Promise<ChannelVideo[]> {
  return apiKey ? apiVideos(channelId, apiKey) : feedVideos(channelId)
}

// ----- Import -----

export const youtubeIdOf = (url: unknown): string | null => (typeof url === 'string' ? (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] ?? null) : null)
export const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
const CATEGORIES = new Set<string>(VIDEO_CATEGORIES.map((c) => c.value))

type Target = 'videos' | 'replays'

/** Durée maximale d'un Short (YouTube les limite à 3 minutes) : sans lien /shorts/, une vidéo d'une minute au plus en est un. */
const SHORT_MAX_SECONDS = 60

/** Rubrique d'une vidéo : Shorts et vidéos courtes (ou de durée inconnue) dans « Vidéos », émissions longues dans « Replays ». */
export function destination(video: Pick<ChannelVideo, 'seconds' | 'short'>, replayMinutes: number): Target {
  if (video.short || (video.seconds !== null && video.seconds <= SHORT_MAX_SECONDS)) return 'videos'
  return video.seconds !== null && video.seconds >= replayMinutes * 60 ? 'replays' : 'videos'
}

/** Identifiants YouTube des fiches d'une collection (brouillons et contenus retirés du site compris). */
async function onSite(payload: Payload, collection: Target): Promise<Set<string>> {
  const { docs } = await payload.find({ collection, draft: true, where: { 'source.provider': { equals: 'youtube' } }, pagination: false, depth: 0, select: { source: true } })
  return new Set(docs.map((d) => youtubeIdOf(d.source?.youtubeUrl)).filter((id): id is string => Boolean(id)))
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
/** Position du nom dans le titre, en mots entiers (« Le journal » ne figure pas dans « Le journalisme »), ou -1. */
function wordIndex(title: string, name: string): number {
  for (let at = title.indexOf(name); at !== -1; at = title.indexOf(name, at + 1)) {
    if (!LETTER_OR_DIGIT.test(title[at - 1] ?? '') && !LETTER_OR_DIGIT.test(title[at + name.length] ?? '')) return at
  }
  return -1
}

/**
 * Émission d'un replay d'après son titre : celle dont le nom commence le titre de la vidéo (ou y figure), en mots entiers,
 * la plus longue l'emportant (« Le journal des Alpes — Soir » → « Le journal des Alpes »). Sans correspondance : aucune émission.
 */
export function matchProgram(title: string, programs: { id: number; title: string }[]): number | null {
  const t = foldText(title)
  let best: { id: number; score: number } | null = null
  for (const p of programs) {
    const name = foldText(p.title).trim()
    if (name.length < 3) continue
    const at = wordIndex(t, name)
    const score = at === 0 ? name.length * 2 : at > 0 ? name.length : 0
    if (score && (!best || score > best.score)) best = { id: p.id, score }
  }
  return best?.id ?? null
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « 3 vidéos dans « Vidéos » et 2 vidéos dans « Replays » (sur 15 vidéos lues sur la chaîne) » */
export function importSummary(r: Pick<YoutubeImportResult, 'videos' | 'replays' | 'total'>): string {
  if (!r.videos && !r.replays) {
    return `rien à ajouter : ${plural(r.total, 'vidéo')} de la chaîne, ${r.total > 1 ? 'toutes déjà' : 'déjà'} sur le site`
  }
  const parts = [r.videos ? `${plural(r.videos, 'vidéo')} dans « Vidéos »` : '', r.replays ? `${plural(r.replays, 'vidéo')} dans « Replays »` : ''].filter(Boolean)
  return `${parts.join(' et ')} (sur ${plural(r.total, 'vidéo')} ${r.total > 1 ? 'lues' : 'lue'} sur la chaîne)`
}

/** Import en cours dans ce processus (tâche planifiée, bouton « Importer maintenant »). */
let running: Promise<YoutubeImportResult> | null = null

/**
 * Met sur le site les vidéos lues sur la chaîne (sans clé : les 15 dernières) : chacune qui n'est encore ni dans
 * « Vidéos » ni dans « Replays » est créée dans la rubrique que lui donne sa durée. `force` : même si l'import
 * automatique est désactivé (bouton « Importer maintenant »). Ne lève jamais d'exception ; le résultat est noté dans le global.
 * Un seul import à la fois (long au premier passage, chaque vidéo recevant son image et son aperçu animé) : pendant un
 * import, la tâche planifiée en partage le résultat, « Importer maintenant » attend sa fin puis relance un import ; les
 * mêmes vidéos ne sont jamais créées deux fois.
 */
export async function importYoutube(payload: Payload, options: { force?: boolean } = {}): Promise<YoutubeImportResult> {
  // « Importer maintenant » pendant un import : attend sa fin, puis relance avec les réglages tout juste enregistrés
  if (running && options.force) await running.catch(() => undefined)
  running ??= runImport(payload, options).finally(() => {
    running = null
  })
  return running
}

async function runImport(payload: Payload, { force = false }: { force?: boolean }): Promise<YoutubeImportResult> {
  const result: YoutubeImportResult = { ok: false, created: 0, videos: 0, replays: 0, skipped: 0, total: 0, ids: [] }
  const settings = await payload.findGlobal({ slug: 'youtube', depth: 0 })
  if (!settings.channel?.trim()) return { ...result, error: 'aucune chaîne YouTube renseignée (Vidéos › Chaîne YouTube)' }
  if (settings.autoImport === false && !force) return { ...result, error: 'import automatique désactivé' }

  const context = { disableRevalidate: true }
  try {
    const ref = parseChannel(settings.channel)
    if (!ref) throw new Error('adresse de chaîne YouTube non reconnue')
    // l'identifiant (UC…) est retenu tant que l'adresse saisie ne change pas
    const channelId = settings.channelId && settings.channelFrom === settings.channel ? settings.channelId : await resolveChannelId(ref, process.env.YOUTUBE_API_KEY)
    const videos = await channelVideos(channelId)
    result.total = videos.length
    result.ids = videos.map((v) => v.id)

    // une vidéo déjà dans l'une des deux rubriques n'est pas recréée dans l'autre
    const [inVideos, inReplays] = await Promise.all([onSite(payload, 'videos'), onSite(payload, 'replays')])
    const replayMinutes = typeof settings.replayMinutes === 'number' && settings.replayMinutes > 0 ? settings.replayMinutes : 20
    const category = settings.category && CATEGORIES.has(settings.category) ? settings.category : 'divertissement'
    const draft = settings.publishMode === 'draft'
    const programs = (await payload.find({ collection: 'programs', pagination: false, depth: 0, select: { title: true } })).docs.map((p) => ({ id: p.id, title: p.title }))

    // les plus anciennes d'abord : à date égale, l'ordre de création suit celui de la chaîne
    for (const video of [...videos].reverse()) {
      if (inVideos.has(video.id) || inReplays.has(video.id)) {
        result.skipped++
        continue
      }
      // sans clé d'API, la durée se lit sur la page de la vidéo
      if (video.seconds === null && !video.short) video.seconds = await pageSeconds(video.id)
      const common = {
        title: clip(video.title, TITLE_MAX),
        source: { provider: 'youtube' as const, youtubeUrl: `https://www.youtube.com/watch?v=${video.id}` },
        description: clip(video.description, DESCRIPTION_MAX) || null,
        _status: draft ? ('draft' as const) : ('published' as const),
      }
      const date = video.publishedAt ?? new Date().toISOString()
      if (destination(video, replayMinutes) === 'replays') {
        const program = matchProgram(video.title, programs)
        await payload.create({
          collection: 'replays',
          draft,
          data: { ...common, duration: minutesDuration(video.seconds), broadcastAt: date, ...(program ? { program } : {}) },
          context,
        })
        inReplays.add(video.id)
        result.replays++
      } else {
        await payload.create({
          collection: 'videos',
          draft,
          data: { ...common, duration: clockDuration(video.seconds), category: category as (typeof VIDEO_CATEGORIES)[number]['value'], publishedAt: date },
          context,
        })
        inVideos.add(video.id)
        result.videos++
      }
    }
    result.created = result.videos + result.replays
    result.ok = true
    await payload.updateGlobal({
      slug: 'youtube',
      data: { channelId, channelFrom: settings.channel, lastImportAt: new Date().toISOString(), lastResult: importSummary(result), lastError: null },
      context,
    })
  } catch (error) {
    result.created = result.videos + result.replays
    result.error = error instanceof Error ? (error.name === 'TimeoutError' ? 'YouTube ne répond pas (délai de 10 s dépassé)' : error.message) : String(error)
    await payload.updateGlobal({ slug: 'youtube', data: { lastImportAt: new Date().toISOString(), lastError: result.error }, context }).catch(() => {})
  }
  return result
}
