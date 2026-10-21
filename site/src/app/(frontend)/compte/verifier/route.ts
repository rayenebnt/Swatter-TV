import config from '@payload-config'
import { getPayload } from 'payload'
import { hashToken } from '@/lib/members/crypto'
import { confirmCookie, NO_COUNTS } from '@/lib/members/session'
import { SITE_URL } from '@/lib/site'

/**
 * Lien reçu par e-mail après l'inscription : /compte/verifier?token=… ne confirme RIEN par lui-même (les antivirus de
 * messagerie ouvrent les liens, et un tiers a pu inscrire l'adresse avec son propre mot de passe). Il garde le jeton une
 * heure dans un cookie httpOnly puis ouvre la page de connexion : le compte est confirmé quand le membre y saisit le mot de
 * passe choisi à l'inscription. Le jeton reste reconnu jusqu'à son expiration : un clic sur un compte déjà confirmé
 * affiche « adresse déjà confirmée » au lieu d'une erreur.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const to = (query: string, cookies: string[] = []) => {
    const headers = new Headers({ location: `${SITE_URL}/connexion?${query}`, 'cache-control': 'no-store' })
    for (const c of cookies) headers.append('set-cookie', c)
    return new Response(null, { status: 303, headers })
  }
  if (!token || token.length > 200) return to('verification=invalide')
  const payload = await getPayload({ config })
  const member = (
    await payload.find({
      collection: 'members',
      where: { and: [{ verifyTokenHash: { equals: hashToken(token) } }, { verifyTokenExpires: { greater_than: new Date().toISOString() } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      pagination: false,
      context: NO_COUNTS,
    })
  ).docs[0]
  if (!member || member.blocked) return to('verification=invalide')
  if (member.verified) return to('verifie=deja')
  return to(`confirmer=1&email=${encodeURIComponent(member.email)}`, [confirmCookie(token)])
}
