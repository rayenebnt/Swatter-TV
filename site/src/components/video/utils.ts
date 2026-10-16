// Outils de la rubrique vidéo (utilisables côté serveur et client) : visuels de repli, images, données structurées.
import type { ResolvedVideo } from '@/lib/video'
import { absoluteUrl, SITE_URL } from '@/lib/site'

const VISUALS = ['t-crepuscule-a', 't-matin-a', 't-nuit-b', 't-ete-a', 't-hiver-a', 't-alpenglow-a', 't-nuages-a', 't-orage-b', 't-crepuscule-b', 't-matin-b', 't-ete-b', 't-hiver-b']

/** Heure du rendu serveur (badges « Nouveau », dates relatives). Jamais dans le premier rendu d'un composant client. */
export const renderNow = () => Date.now()

/** Visuel de la maquette utilisé quand un contenu n'a pas d'image (choix stable d'après l'identifiant). */
export const fallbackVisual = (id: number | string = 0) => {
  const n = typeof id === 'number' ? id : [...id].reduce((s, c) => s + c.charCodeAt(0), 0)
  return `/visuels/${VISUALS[Math.abs(n) % VISUALS.length]}.webp`
}

/** Hôtes distants acceptés par l'optimiseur d'images (voir images.remotePatterns de next.config.ts). */
const OPTIMIZABLE_HOSTS = [/^i\.ytimg\.com$/, /\.b-cdn\.net$/, /\.amazonaws\.com$/]

/**
 * Source pour next/image : une adresse absolue du site lui-même redevient relative (optimisée en AVIF/WebP),
 * une adresse distante n'est optimisée que si son hôte est autorisé.
 */
export function imageSource(url: string): { src: string; unoptimized: boolean } {
  if (url.startsWith(`${SITE_URL}/`)) return { src: url.slice(SITE_URL.length), unoptimized: false }
  if (!/^https?:\/\//.test(url)) return { src: url, unoptimized: false }
  try {
    const host = new URL(url).hostname
    return { src: url, unoptimized: !OPTIMIZABLE_HOSTS.some((re) => re.test(host)) }
  } catch {
    return { src: url, unoptimized: true }
  }
}

/** Adresse absolue (données structurées, Open Graph). */
export const toAbsolute = (url: string) => (/^https?:\/\//.test(url) ? url : absoluteUrl(url))

/** Durée saisie (« 3:42 », « 1:34:00 », « 52 min », « 1 h 15 ») → ISO 8601 (« PT3M42S »). */
export function isoDuration(text?: string | null): string | undefined {
  const t = text?.trim().toLowerCase()
  if (!t) return undefined
  let h = 0
  let m = 0
  let s = 0
  const clock = t.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (clock) {
    const [a, b, c] = [clock[1], clock[2], clock[3]].map((x) => (x === undefined ? undefined : Number(x)))
    if (c === undefined) [m, s] = [a ?? 0, b ?? 0]
    else [h, m, s] = [a ?? 0, b ?? 0, c]
  } else {
    const hours = t.match(/(\d+)\s*h/)
    const minutes = t.match(/(\d+)\s*(?:min|mn|m\b)/) ?? t.match(/h\s*(\d+)/)
    const seconds = t.match(/(\d+)\s*s/)
    if (!hours && !minutes && !seconds) return undefined
    h = Number(hours?.[1] ?? 0)
    m = Number(minutes?.[1] ?? 0)
    s = Number(seconds?.[1] ?? 0)
  }
  const total = h * 3600 + m * 60 + s
  if (!total) return undefined
  const H = Math.floor(total / 3600)
  const M = Math.floor((total % 3600) / 60)
  const S = total % 60
  return `PT${H ? `${H}H` : ''}${M ? `${M}M` : ''}${S ? `${S}S` : ''}`
}

/** Durée lisible pour les lecteurs d'écran : « 3:42 » → « 3 min 42 s ». */
export function spokenDuration(text?: string | null): string | undefined {
  const iso = isoDuration(text)
  if (!iso) return text ?? undefined
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return text ?? undefined
  return [m[1] && `${m[1]} h`, m[2] && `${m[2]} min`, m[3] && `${m[3]} s`].filter(Boolean).join(' ')
}

/** Adresse de lecture pour les données structurées : intégration (embedUrl) ou fichier (contentUrl). */
export function videoLocation(video: ResolvedVideo | null): { embedUrl?: string; contentUrl?: string } {
  if (!video) return {}
  switch (video.kind) {
    case 'youtube':
      return { embedUrl: `https://www.youtube.com/embed/${video.id}` }
    case 'iframe':
      return { embedUrl: video.embedUrl.split('?')[0] }
    default:
      return { contentUrl: toAbsolute(video.src) }
  }
}

/** Données structurées schema.org VideoObject. */
export function videoObject({
  name,
  description,
  thumbnail,
  uploadDate,
  duration,
  url,
  video,
  views,
  extra,
}: {
  name: string
  description?: string | null
  thumbnail: string
  uploadDate: string
  duration?: string | null
  url: string
  video: ResolvedVideo | null
  views?: number | null
  extra?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description: description?.trim() || name,
    thumbnailUrl: [toAbsolute(thumbnail)],
    uploadDate: new Date(uploadDate).toISOString(),
    ...(isoDuration(duration) ? { duration: isoDuration(duration) } : {}),
    url: absoluteUrl(url),
    ...videoLocation(video),
    ...(views ? { interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: views } } : {}),
    publisher: { '@type': 'Organization', name: 'Swatter TV', url: absoluteUrl('/'), logo: { '@type': 'ImageObject', url: absoluteUrl('/apple-touch-icon.png') } },
    inLanguage: 'fr-FR',
    ...extra,
  }
}
