// Limites d'envoi par adresse IP (mémoire du processus : suffisant pour un serveur unique).

const buckets = new Map<string, Map<string, number[]>>()

/**
 * Adresse IP du visiteur. Le reverse proxy ajoute (Nginx, Traefik) ou écrit (Caddy) l'adresse qu'il voit à la fin de
 * X-Forwarded-For : on lit donc le dernier maillon, que le visiteur ne peut pas inventer (les maillons précédents
 * viennent de lui). `TRUSTED_PROXY_HOPS` : nombre de proxys de confiance en chaîne (1 par défaut ; 2 derrière un CDN
 * qui ajoute aussi son maillon, par exemple Cloudflare puis Caddy).
 */
export function clientIp(headers: Headers): string {
  const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS)) || 1)
  const chain = (headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean)
  return chain[Math.max(0, chain.length - hops)] || headers.get('x-real-ip') || 'inconnue'
}

/** Vrai si l'action `name` est encore permise pour cette IP (au plus `max` fois par fenêtre) ; l'enregistre alors. */
export function allow(name: string, headers: Headers, max: number, windowMs: number): boolean {
  const ip = clientIp(headers)
  const now = Date.now()
  let bucket = buckets.get(name)
  if (!bucket) buckets.set(name, (bucket = new Map()))
  const recent = (bucket.get(ip) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    bucket.set(ip, recent)
    return false
  }
  bucket.set(ip, [...recent, now])
  if (bucket.size > 10_000) {
    // ménage : d'abord les adresses dont la fenêtre est passée, tout en dernier recours
    for (const [key, hits] of bucket) if (now - hits[hits.length - 1] >= windowMs) bucket.delete(key)
    if (bucket.size > 10_000) bucket.clear()
  }
  return true
}

/** Limites réglables par variable d'environnement (tests de bout en bout : MEMBER_RATE_FACTOR=10). */
export const rateFactor = () => Math.max(1, Number(process.env.MEMBER_RATE_FACTOR) || 1)
