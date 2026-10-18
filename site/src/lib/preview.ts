// Aperçu en direct : adresse de la page publique d'un contenu et adresse d'activation du mode aperçu.
import type { PayloadRequest } from 'payload'
import { articleUrl, eventUrl, pageUrl, replayUrl, videoUrl } from './urls'
import { SITE_URL } from './site'

type Data = { slug?: string | null; department?: string | null }

/** Page du site qui affiche ce contenu (la rubrique, tant que le contenu n'a pas encore d'adresse). */
export function previewPath(collection: string | undefined, global: string | undefined, data: Data): string {
  if (global === 'settings') return '/'
  const has = Boolean(data?.slug)
  switch (collection) {
    case 'videos':
      return has ? videoUrl(data) : '/videos'
    case 'articles':
      return has ? articleUrl(data) : '/info'
    case 'events':
      return has ? eventUrl(data) : '/agenda'
    case 'replays':
      return has ? replayUrl(data) : '/replay'
    case 'pages':
      return has ? pageUrl(data) : '/'
    default:
      return '/'
  }
}

/** Seules les adresses internes au site sont acceptées (pas de redirection vers un autre site). */
export function safePath(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/'
}

/**
 * Adresse absolue (exigée par window.postMessage de l'aperçu) de la même origine que l'administration consultée,
 * pour que le cookie de connexion accompagne l'aperçu.
 */
export function previewUrl(req: PayloadRequest, path: string): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? (SITE_URL.startsWith('https') ? 'https' : 'http')
  const origin = host ? `${proto.split(',')[0]}://${host.split(',')[0]}` : SITE_URL
  return `${origin}/apercu?chemin=${encodeURIComponent(path)}`
}
