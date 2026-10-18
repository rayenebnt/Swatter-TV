import config from '@payload-config'
import { draftMode, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { safePath } from '@/lib/preview'

/**
 * Active le mode aperçu (brouillons visibles sur le site) puis ouvre la page demandée : /apercu?chemin=/videos/…
 * Réservé aux personnes connectées à l'administration ; utilisé par l'aperçu en direct des fiches.
 */
export async function GET(request: Request) {
  const path = safePath(new URL(request.url).searchParams.get('chemin'))
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(`${payload.config.routes.admin}/login?redirect=${encodeURIComponent(`/apercu?chemin=${path}`)}`)
  ;(await draftMode()).enable()
  redirect(path)
}
