// Import des vidéos de la chaîne YouTube de Swatter TV dans la collection « videos » (global « youtube »).
// Sans clé : flux RSS public de la chaîne (ses 15 dernières vidéos). Avec YOUTUBE_API_KEY : toute la chaîne (API YouTube).
// Appelé par GET /api/cron/import (toutes les heures), POST /api/youtube/import (bouton « Importer maintenant ») et
// src/scripts/import.ts. Une vidéo déjà importée une fois ne l'est plus jamais (même supprimée du site ensuite).
import { XMLParser } from 'fast-xml-parser'
import type { Payload } from 'payload'
import { VIDEO_CATEGORIES } from '@/lib/categories'

export type YoutubeImportResult = { ok: boolean; created: number; skipped: number; total: number; error?: string }

export type ChannelVideo = { id: string; title: string; description: string; publishedAt: string | null; duration: string | null }

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
  const [first, second] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
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

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => name === 'entry' })
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
    return [{ id, title, description: text(group?.['media:description']), publishedAt: isoDate(entry.published), duration: null }]
  })
}

async function feedVideos(channelId: string): Promise<ChannelVideo[]> {
  const res = await get(`${siteBase()}/feeds/videos.xml?channel_id=${channelId}`)
  if (res.status === 404) throw new Error('flux de la chaîne introuvable : vérifiez l’adresse de la chaîne')
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status} pour le flux de la chaîne`)
  return parseChannelFeed(await res.text())
}

// ----- API YouTube (avec clé : toute la chaîne, durées comprises) -----

/** « PT1H2M3S » → « 1:02:03 » ; « PT4M5S » → « 04:05 ». */
export function formatIsoDuration(iso: string | null | undefined): string | null {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const hours = Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)
  const [min, sec] = [Number(m[3] ?? 0), Number(m[4] ?? 0)]
  if (!hours && !min && !sec) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(min)}:${pad(sec)}` : `${pad(min)}:${pad(sec)}`
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
      videos.push({ id, title, description: item.snippet?.description?.trim() ?? '', publishedAt: isoDate(item.contentDetails.videoPublishedAt), duration: null })
    }
    token = page.nextPageToken
  } while (token && videos.length < API_MAX_VIDEOS)

  // durées, par paquets de 50
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50)
    const json = await apiJson<{ items?: { id?: string; contentDetails?: { duration?: string } }[] }>(`videos?part=contentDetails&id=${batch.map((v) => v.id).join(',')}`, apiKey)
    const durations = new Map((json.items ?? []).map((v) => [v.id, formatIsoDuration(v.contentDetails?.duration)]))
    for (const v of batch) v.duration = durations.get(v.id) ?? null
  }
  return videos
}

/** Vidéos de la chaîne, des plus récentes aux plus anciennes. */
export async function channelVideos(channelId: string, apiKey = process.env.YOUTUBE_API_KEY): Promise<ChannelVideo[]> {
  return apiKey ? apiVideos(channelId, apiKey) : feedVideos(channelId)
}

// ----- Import -----

const youtubeIdOf = (url: unknown): string | null => (typeof url === 'string' ? (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] ?? null) : null)
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
const CATEGORIES = new Set<string>(VIDEO_CATEGORIES.map((c) => c.value))

/**
 * Crée dans « Vidéos » les vidéos de la chaîne qui n'ont jamais été importées. `force` : même si l'import automatique
 * est désactivé (bouton « Importer maintenant »). Ne lève jamais d'exception ; le résultat est noté dans le global.
 */
export async function importYoutube(payload: Payload, { force = false } = {}): Promise<YoutubeImportResult> {
  const result: YoutubeImportResult = { ok: false, created: 0, skipped: 0, total: 0 }
  const settings = await payload.findGlobal({ slug: 'youtube', depth: 0 })
  if (!settings.channel?.trim()) return { ...result, error: 'aucune chaîne YouTube renseignée (Vidéos › Chaîne YouTube)' }
  if (settings.autoImport === false && !force) return { ...result, error: 'import automatique désactivé' }

  const context = { disableRevalidate: true }
  const known = new Set<string>(Array.isArray(settings.importedIds) ? settings.importedIds.filter((v): v is string => typeof v === 'string') : [])
  try {
    const ref = parseChannel(settings.channel)
    if (!ref) throw new Error('adresse de chaîne YouTube non reconnue')
    // l'identifiant (UC…) est retenu tant que l'adresse saisie ne change pas
    const channelId = settings.channelId && settings.channelFrom === settings.channel ? settings.channelId : await resolveChannelId(ref, process.env.YOUTUBE_API_KEY)
    const videos = await channelVideos(channelId)
    result.total = videos.length

    // vidéos déjà sur le site (ajoutées à la main avec leur lien YouTube, brouillons compris)
    const { docs } = await payload.find({
      collection: 'videos',
      draft: true,
      where: { 'source.provider': { equals: 'youtube' } },
      pagination: false,
      depth: 0,
      select: { source: true },
    })
    const onSite = new Set(docs.map((d) => youtubeIdOf(d.source?.youtubeUrl)).filter(Boolean))

    const category = settings.category && CATEGORIES.has(settings.category) ? settings.category : 'divertissement'
    const draft = settings.publishMode === 'draft'
    // les plus anciennes d'abord : à date égale, l'ordre de création suit celui de la chaîne
    for (const video of [...videos].reverse()) {
      if (known.has(video.id) || onSite.has(video.id)) {
        known.add(video.id)
        result.skipped++
        continue
      }
      await payload.create({
        collection: 'videos',
        draft,
        data: {
          title: clip(video.title, TITLE_MAX),
          source: { provider: 'youtube', youtubeUrl: `https://www.youtube.com/watch?v=${video.id}` },
          category: category as (typeof VIDEO_CATEGORIES)[number]['value'],
          duration: video.duration,
          description: clip(video.description, DESCRIPTION_MAX) || null,
          publishedAt: video.publishedAt ?? new Date().toISOString(),
          _status: draft ? 'draft' : 'published',
        },
        context,
      })
      known.add(video.id)
      result.created++
    }
    result.ok = true
    await payload.updateGlobal({
      slug: 'youtube',
      data: {
        channelId,
        channelFrom: settings.channel,
        importedIds: [...known],
        lastImportAt: new Date().toISOString(),
        lastResult: result.created ? `${result.created} nouvelle${result.created > 1 ? 's' : ''} vidéo${result.created > 1 ? 's' : ''} ajoutée${result.created > 1 ? 's' : ''}` : 'aucune nouvelle vidéo',
        lastError: null,
      },
      context,
    })
  } catch (error) {
    result.error = error instanceof Error ? (error.name === 'TimeoutError' ? 'YouTube ne répond pas (délai de 10 s dépassé)' : error.message) : String(error)
    // vidéos créées avant l'erreur : retenues quand même
    await payload
      .updateGlobal({ slug: 'youtube', data: { importedIds: [...known], lastImportAt: new Date().toISOString(), lastError: result.error }, context })
      .catch(() => {})
  }
  return result
}
