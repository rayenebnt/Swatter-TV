// Espace membres côté serveur : cookies de session et membre connecté (API /api/compte et pages /compte).
import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { cache } from 'react'
import type { Member } from '@/payload-types'
import { SITE_URL } from '@/lib/site'
import { readSession, signSession } from './crypto'
import { CONFIRM_COOKIE, HINT_COOKIE, SESSION_COOKIE, type MemberProfile } from './shared'

const secure = SITE_URL.startsWith('https://')

/** Lectures internes d'un membre : sans les compteurs de sa fiche d'administration (historique, liste). */
export const NO_COUNTS = { memberCounts: false }

function cookie(name: string, value: string, expires: Date | null, httpOnly: boolean): string {
  const parts = [`${name}=${value}`, 'Path=/', 'SameSite=Lax']
  if (expires) parts.push(`Expires=${expires.toUTCString()}`, `Max-Age=${Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))}`)
  else parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'Max-Age=0')
  if (httpOnly) parts.push('HttpOnly')
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** En-têtes Set-Cookie d'une nouvelle session (cookie signé httpOnly + cookie témoin pour l'affichage). */
export function sessionCookies(member: Pick<Member, 'id' | 'sessionVersion'>): string[] {
  const { value, expires } = signSession(member.id, Number(member.sessionVersion) || 0)
  return [cookie(SESSION_COOKIE, value, expires, true), cookie(HINT_COOKIE, '1', expires, false)]
}

/** En-têtes Set-Cookie qui effacent la session. */
export const clearCookies = (): string[] => [cookie(SESSION_COOKIE, '', null, true), cookie(HINT_COOKIE, '', null, false)]

/**
 * Jeton du lien de confirmation, gardé une heure dans un cookie httpOnly par /compte/verifier : la confirmation se fait
 * ensuite à la connexion, avec le mot de passe choisi à l'inscription (le jeton ne reste pas dans l'adresse de la page).
 */
export const confirmCookie = (token: string): string => cookie(CONFIRM_COOKIE, encodeURIComponent(token), new Date(Date.now() + 60 * 60 * 1000), true)
export const clearConfirmCookie = (): string => cookie(CONFIRM_COOKIE, '', null, true)

export function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/**
 * Membre d'une session : signature, date, version de session, compte confirmé et non suspendu. Les champs techniques
 * (empreintes, jetons) sont lus pour la vérification : ne jamais renvoyer ce document tel quel au navigateur.
 */
async function memberOf(payload: Payload, token: string | null): Promise<Member | null> {
  const claims = readSession(token)
  if (!claims) return null
  const member = await payload
    .findByID({ collection: 'members', id: claims.m, depth: 0, overrideAccess: true, showHiddenFields: true, disableErrors: true, context: NO_COUNTS })
    .catch(() => null)
  if (!member || member.blocked || !member.verified || (Number(member.sessionVersion) || 0) !== claims.s) return null
  return member
}

/** Membre connecté d'une requête d'API (cookie de session), sinon null. */
export const memberFromHeaders = (payload: Payload, headers: Headers) => memberOf(payload, cookieValue(headers.get('cookie'), SESSION_COOKIE))

/** Membre connecté pour les pages du site (une seule lecture par rendu), sinon null. */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const store = await cookies()
  const payload = await getPayload({ config })
  return memberOf(payload, store.get(SESSION_COOKIE)?.value ?? null)
})

/** Profil présentable au membre (jamais les champs techniques). */
export function toProfile(m: Member): MemberProfile {
  return {
    firstName: m.firstName,
    lastName: m.lastName ?? '',
    email: m.email,
    department: m.department ?? null,
    newsletter: Boolean(m.newsletter),
    historyPaused: Boolean(m.historyPaused),
    createdAt: m.createdAt,
  }
}

/**
 * Protection contre les requêtes d'un autre site (en plus du cookie SameSite=Lax) : une requête qui modifie quelque chose
 * doit venir du site lui-même (en-tête Origin, ou à défaut Sec-Fetch-Site).
 */
export function sameOrigin(headers: Headers, requestUrl?: string): boolean {
  const origin = headers.get('origin')
  const allowed = new Set([new URL(SITE_URL).origin])
  if (requestUrl) {
    try {
      allowed.add(new URL(requestUrl).origin)
    } catch {
      // adresse de requête illisible : seule l'origine du site compte
    }
  }
  if (origin) return allowed.has(origin)
  const site = headers.get('sec-fetch-site')
  return !site || site === 'same-origin' || site === 'none'
}
