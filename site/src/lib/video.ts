import type { Media } from '@/payload-types'

/** Source vidéo telle que stockée par le champ videoSourceField. */
export type VideoSourceData = {
  provider?: 'youtube' | 'twitch' | 'bunny' | 'url' | 'upload' | null
  youtubeUrl?: string | null
  twitchUrl?: string | null
  bunnyVideoId?: string | null
  url?: string | null
  file?: Media | number | string | null
} | null | undefined

/** Ce que lit le lecteur Twitch : une chaîne (le direct) ou une vidéo déjà diffusée (« v123456789 »). */
export type TwitchTarget = { param: 'channel' | 'video'; value: string }

export type ResolvedVideo =
  | { kind: 'youtube'; id: string; embedUrl: string; thumbnail: string }
  | ({ kind: 'twitch' } & TwitchTarget)
  | { kind: 'iframe'; embedUrl: string }
  | { kind: 'hls'; src: string }
  | { kind: 'mp4'; src: string }

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : /^[\w-]{11}$/.test(url) ? url : null
}

const TWITCH_NAME = /^[a-z0-9_]{3,25}$/i
/** Pages de twitch.tv qui ne sont pas des chaînes. */
const TWITCH_PAGES = new Set(['directory', 'downloads', 'p', 'search', 'settings', 'videos'])

/**
 * Chaîne ou vidéo Twitch d'après ce qu'on a collé : « https://www.twitch.tv/swattertv », « twitch.tv/swattertv »,
 * « swattertv », « https://www.twitch.tv/videos/123456789 » ou un lien de lecteur intégré (player.twitch.tv/?channel=…).
 */
export function twitchTarget(input: string | null | undefined): TwitchTarget | null {
  const raw = input?.trim()
  if (!raw) return null
  if (TWITCH_NAME.test(raw)) return { param: 'channel', value: raw.toLowerCase() }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!/(^|\.)twitch\.tv$/i.test(url.hostname)) return null
  const channel = url.searchParams.get('channel')
  const video = url.searchParams.get('video')?.replace(/^v/i, '')
  if (url.hostname.toLowerCase() === 'player.twitch.tv') {
    if (channel && TWITCH_NAME.test(channel)) return { param: 'channel', value: channel.toLowerCase() }
    return video && /^\d+$/.test(video) ? { param: 'video', value: `v${video}` } : null
  }
  const [first, second] = url.pathname.split('/').filter(Boolean)
  if (first === 'videos') return second && /^\d+$/.test(second) ? { param: 'video', value: `v${second}` } : null
  return first && TWITCH_NAME.test(first) && !TWITCH_PAGES.has(first.toLowerCase()) ? { param: 'channel', value: first.toLowerCase() } : null
}

/**
 * Adresse du lecteur Twitch. Twitch exige le nom de domaine de chaque page qui l'intègre (`parent`, sans port ni
 * protocole) et un site en HTTPS : le lecteur ne s'affiche donc pas en développement sur http://localhost.
 */
export function twitchEmbedUrl({ param, value }: TwitchTarget, hosts: string[]): string {
  const params = new URLSearchParams({ [param]: value, autoplay: 'true', muted: 'false' })
  for (const host of new Set(hosts.filter(Boolean))) params.append('parent', host)
  return `https://player.twitch.tv/?${params}`
}

/** Transforme une source saisie dans l'administration en lecture exploitable par le lecteur. */
export function resolveVideo(source: VideoSourceData): ResolvedVideo | null {
  if (!source?.provider) return null
  switch (source.provider) {
    case 'youtube': {
      const id = source.youtubeUrl ? youtubeId(source.youtubeUrl) : null
      return id
        ? { kind: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
        : null
    }
    case 'twitch': {
      const target = twitchTarget(source.twitchUrl)
      return target ? { kind: 'twitch', ...target } : null
    }
    case 'bunny': {
      const lib = process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID
      return lib && source.bunnyVideoId
        ? { kind: 'iframe', embedUrl: `https://iframe.mediadelivery.net/embed/${lib}/${source.bunnyVideoId}?autoplay=true&preload=true&responsive=true` }
        : null
    }
    case 'url': {
      const src = source.url?.trim()
      if (!src) return null
      return /\.m3u8(\?|$)/i.test(src) ? { kind: 'hls', src } : { kind: 'mp4', src }
    }
    case 'upload': {
      const f = source.file
      const src = typeof f === 'object' && f ? f.url : null
      return src ? { kind: 'mp4', src } : null
    }
  }
  return null
}
