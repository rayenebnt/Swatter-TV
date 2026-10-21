import config from '@payload-config'
import { getPayload } from 'payload'
import { hashToken } from '@/lib/members/crypto'
import { SITE_URL } from '@/lib/site'

/**
 * Lien reçu par e-mail après l'inscription : /compte/verifier?token=… confirme l'adresse puis renvoie vers la page de
 * connexion avec un message. Le jeton reste reconnu jusqu'à son expiration : un second clic (ou l'analyse du lien par une
 * messagerie) affiche « adresse déjà confirmée » au lieu d'une erreur.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const to = (query: string) => Response.redirect(`${SITE_URL}/connexion?${query}`, 303)
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
    })
  ).docs[0]
  if (!member || member.blocked) return to('verification=invalide')
  if (member.verified) return to('verifie=deja')
  await payload.update({ collection: 'members', id: member.id, data: { verified: true, loginAttempts: 0, lockUntil: null }, overrideAccess: true, depth: 0 })
  return to(`verifie=1&email=${encodeURIComponent(member.email)}`)
}
