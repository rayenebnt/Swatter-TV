import type { Media } from '@/payload-types'
import { mediaUrl, type MediaRef } from './media'

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

/**
 * Identifiant (11 caractères) d'une vidéo YouTube : lien de partage, de lecture, de Short, de direct ou de lecteur intégré
 * (youtube.com ou youtube-nocookie.com). Une liste de lecture intégrée (embed/videoseries) ou un identifiant trop long : null.
 */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/(?!videoseries)|shorts\/|live\/))([\w-]{11})(?![\w-])/)
  return m ? m[1] : /^[\w-]{11}$/.test(url) ? url : null
}

const TWITCH_NAME = /^[a-z0-9_]{3,25}$/i
/** Pages de twitch.tv qui ne sont pas des chaînes. */
const TWITCH_PAGES = new Set(['directory', 'downloads', 'drops', 'inventory', 'login', 'p', 'search', 'settings', 'signup', 'subscriptions', 'turbo', 'videos', 'wallet'])
/** Pages d'outils dont le deuxième segment est la chaîne : twitch.tv/popout/<chaîne>/chat, twitch.tv/moderator/<chaîne>. */
const TWITCH_TOOLS = new Set(['embed', 'moderator', 'popout'])
/** Domaines de Twitch qui mènent à une chaîne ou à une vidéo (pas clips.twitch.tv, dashboard.twitch.tv…). */
const TWITCH_HOSTS = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'player.twitch.tv'])

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
  if (!TWITCH_HOSTS.has(url.hostname.toLowerCase())) return null
  const channel = url.searchParams.get('channel')
  const video = url.searchParams.get('video')?.replace(/^v/i, '')
  if (url.hostname.toLowerCase() === 'player.twitch.tv') {
    if (channel && TWITCH_NAME.test(channel)) return { param: 'channel', value: channel.toLowerCase() }
    return video && /^\d+$/.test(video) ? { param: 'video', value: `v${video}` } : null
  }
  const [first, second] = url.pathname.split('/').filter(Boolean)
  if (first === 'videos') return second && /^\d+$/.test(second) ? { param: 'video', value: `v${second}` } : null
  const name = first && TWITCH_TOOLS.has(first.toLowerCase()) ? second : first
  return name && TWITCH_NAME.test(name) && !TWITCH_PAGES.has(name.toLowerCase()) && !TWITCH_TOOLS.has(name.toLowerCase())
    ? { param: 'channel', value: name.toLowerCase() }
    : null
}

/**
 * Adresse du lecteur Twitch. Twitch exige le nom de domaine de chaque page qui l'intègre (`parent`, sans port ni
 * protocole) et un site en HTTPS : le lecteur ne s'affiche donc pas en développement sur http://localhost.
 * `muted` : lecture automatique sans le son (direct lancé seul quand il est visible), sinon avec le son (clic).
 */
export function twitchEmbedUrl({ param, value }: TwitchTarget, hosts: string[], muted = false): string {
  const params = new URLSearchParams({ [param]: value, autoplay: 'true', muted: String(muted) })
  for (const host of new Set(hosts.filter(Boolean))) params.append('parent', host)
  return `https://player.twitch.tv/?${params}`
}

/**
 * Adresse d'un lecteur YouTube ou Bunny Stream lancé seul, sans le son (seule lecture automatique admise par les
 * navigateurs) : YouTube mute=1 et playsinline=1 (sinon plein écran forcé sur iPhone), Bunny Stream muted=true.
 */
export function mutedEmbedUrl(video: { kind: 'youtube' | 'iframe'; embedUrl: string }): string {
  const url = new URL(video.embedUrl)
  if (video.kind === 'youtube') {
    url.searchParams.set('mute', '1')
    url.searchParams.set('playsinline', '1')
  } else {
    url.searchParams.set('muted', 'true')
  }
  return url.toString()
}

/**
 * Aperçu animé d'une vidéo ou d'un replay (court extrait muet de la médiathèque, relation chargée) : son adresse, ou
 * null s'il est absent ou si le média n'est pas une vidéo (rien n'est alors demandé : l'image reste fixe).
 */
export function previewUrl(m: MediaRef): string | null {
  if (typeof m !== 'object' || m === null) return null
  if (m.mimeType && !m.mimeType.startsWith('video/')) return null
  return mediaUrl(m)
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
