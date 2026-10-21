// Limites d'envoi par adresse IP (mémoire du processus : suffisant pour un serveur unique).

const buckets = new Map<string, Map<string, number[]>>()

/** Adresse IP du visiteur (premier maillon de X-Forwarded-For derrière le proxy). */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'inconnue'
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
  if (bucket.size > 10_000) bucket.clear()
  return true
}

/** Limites réglables par variable d'environnement (tests de bout en bout : MEMBER_RATE_FACTOR=10). */
export const rateFactor = () => Math.max(1, Number(process.env.MEMBER_RATE_FACTOR) || 1)
