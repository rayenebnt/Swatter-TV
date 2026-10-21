// Espace membres : mots de passe (scrypt), jetons à usage unique (lien de confirmation, nouveau mot de passe) et
// sessions signées (HMAC). Indépendant de l'authentification de l'administration : un membre n'est jamais `req.user`.
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { SESSION_DAYS } from './shared'

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))))

const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

/** Empreinte d'un mot de passe : « scrypt$N$r$p$sel$empreinte » (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$')
}

/** Compare un mot de passe à son empreinte, en temps constant. Faux pour toute empreinte illisible. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // même coût qu'une vraie vérification : on ne révèle pas l'absence de compte par le temps de réponse
    await scrypt(password, Buffer.alloc(16), KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
    return false
  }
  const [, n, r, p, salt, expected] = parts
  const want = Buffer.from(expected, 'base64url')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), want.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  })
  return key.length === want.length && timingSafeEqual(key, want)
}

/** Jeton à usage unique : la valeur envoyée par e-mail et son empreinte (seule enregistrée en base). */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

function sessionKey(): Buffer {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET manquant : impossible de signer les sessions des membres.')
  // clé propre aux sessions des membres, dérivée du secret du site
  return createHmac('sha256', secret).update('swatter:sessions-membres:v1').digest()
}

export type SessionClaims = { m: number; s: number; e: number }

/** Jeton de session : « v1.<données>.<signature> » ; `s` = version de session du membre (changée pour tout invalider). */
export function signSession(memberId: number, sessionVersion: number, now = Date.now()): { value: string; expires: Date } {
  const expires = new Date(now + SESSION_DAYS * 24 * 3600 * 1000)
  const claims: SessionClaims = { m: memberId, s: sessionVersion, e: Math.floor(expires.getTime() / 1000) }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = createHmac('sha256', sessionKey()).update(`v1.${body}`).digest('base64url')
  return { value: `v1.${body}.${sig}`, expires }
}

/** Contenu d'un jeton de session valide (signature et date), sinon null. */
export function readSession(value: string | null | undefined, now = Date.now()): SessionClaims | null {
  if (!value) return null
  const [version, body, sig] = value.split('.')
  if (version !== 'v1' || !body || !sig) return null
  const expected = createHmac('sha256', sessionKey()).update(`v1.${body}`).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionClaims
    if (!Number.isInteger(claims.m) || !Number.isInteger(claims.s) || !Number.isInteger(claims.e)) return null
    return claims.e * 1000 > now ? claims : null
  } catch {
    return null
  }
}
