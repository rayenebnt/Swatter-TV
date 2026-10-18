import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { safePath } from '@/lib/preview'

/** Quitte le mode aperçu (le site redevient tel que le voient les visiteurs) : /apercu/quitter?chemin=/page-courante */
export async function GET(request: Request) {
  ;(await draftMode()).disable()
  redirect(safePath(new URL(request.url).searchParams.get('chemin')))
}
