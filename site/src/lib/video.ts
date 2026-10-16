import type { Media } from '@/payload-types'

/** Source vidéo telle que stockée par le champ videoSourceField. */
export type VideoSourceData = {
  provider?: 'youtube' | 'bunny' | 'url' | 'upload' | null
  youtubeUrl?: string | null
  bunnyVideoId?: string | null
  url?: string | null
  file?: Media | number | string | null
} | null | undefined

export type ResolvedVideo =
  | { kind: 'youtube'; id: string; embedUrl: string; thumbnail: string }
  | { kind: 'iframe'; embedUrl: string }
  | { kind: 'hls'; src: string }
  | { kind: 'mp4'; src: string }

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : /^[\w-]{11}$/.test(url) ? url : null
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
