// Espace membres : empreintes des mots de passe (scrypt), jetons à usage unique (SHA-256) et sessions signées (HMAC)
// de src/lib/members/crypto.ts. Secret des sessions fixé par le test ; temps simulé pour l'échéance des sessions.
import { createHmac } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword, hashToken, newToken, readSession, signSession, verifyPassword } from '@/lib/members/crypto'
import { SESSION_DAYS } from '@/lib/members/shared'

const SECRET = 'secret-des-tests-unitaires-de-l-espace-membres'
const DAY = 24 * 3600 * 1000
const NOW = Date.parse('2026-10-21T08:00:00.000Z')

/** Jeton signé comme par signSession (clé dérivée du secret), mais avec les données choisies par le test. */
function forge(claims: unknown, secret = SECRET): string {
  const key = createHmac('sha256', secret).update('swatter:sessions-membres:v1').digest()
  const body = Buffer.from(typeof claims === 'string' ? claims : JSON.stringify(claims)).toString('base64url')
  return `v1.${body}.${createHmac('sha256', key).update(`v1.${body}`).digest('base64url')}`
}

/** Remplace le caractère `index` d'un texte base64url par un autre (octets réellement différents s'il n'est pas le dernier). */
const flip = (s: string, index: number) => `${s.slice(0, index)}${s[index] === 'A' ? 'B' : 'A'}${s.slice(index + 1)}`

describe('mots de passe : empreinte scrypt', () => {
  const PASSWORD = 'Lac-d’Annecy 2026 !'
  let stored = ''

  beforeAll(async () => {
    stored = await hashPassword(PASSWORD)
  })

  it('format « scrypt$N$r$p$sel$empreinte » (N = 16384, r = 8, p = 1, sel de 16 octets, empreinte de 64 octets)', () => {
    const parts = stored.split('$')
    expect(parts).toHaveLength(6)
    expect(parts.slice(0, 4)).toEqual(['scrypt', '16384', '8', '1'])
    expect(Buffer.from(parts[4], 'base64url')).toHaveLength(16)
    expect(Buffer.from(parts[5], 'base64url')).toHaveLength(64)
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(parts[5]).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('l’empreinte ne contient pas le mot de passe, et change à chaque fois (sel aléatoire)', async () => {
    expect(stored).not.toContain(PASSWORD)
    const again = await hashPassword(PASSWORD)
    expect(again).not.toBe(stored)
    expect(again.split('$')[4]).not.toBe(stored.split('$')[4])
    await expect(verifyPassword(PASSWORD, again)).resolves.toBe(true)
  })

  it('le bon mot de passe est accepté', async () => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true)
  })

  it('un mauvais mot de passe est refusé (casse, caractère en plus ou en moins, vide)', async () => {
    for (const wrong of ['lac-d’annecy 2026 !', `${PASSWORD} `, PASSWORD.slice(0, -1), 'Lac-d\'Annecy 2026 !', '']) {
      await expect(verifyPassword(wrong, stored), wrong).resolves.toBe(false)
    }
  })

  it('les formes Unicode équivalentes d’un mot de passe sont acceptées (normalisation NFKC)', async () => {
    const composed = await hashPassword('Écrin-été-2026')
    await expect(verifyPassword('E\u0301crin-e\u0301te\u0301-2026', composed)).resolves.toBe(true)
    const fullWidth = await hashPassword('ｐａｓｓｗｏｒｄ１２３')
    await expect(verifyPassword('password123', fullWidth)).resolves.toBe(true)
  })

  it('empreinte absente : faux, après un calcul aussi coûteux qu’une vraie vérification', async () => {
    for (const absent of [null, undefined, '']) {
      const start = performance.now()
      await expect(verifyPassword(PASSWORD, absent)).resolves.toBe(false)
      // scrypt (16 Mio de mémoire) prend des dizaines de millisecondes : une réponse immédiate révélerait l'absence de compte
      expect(performance.now() - start).toBeGreaterThanOrEqual(10)
    }
  })

  it('empreinte illisible (texte quelconque, mauvais nombre de parties, autre algorithme) : faux', async () => {
    const parts = stored.split('$')
    for (const bad of [
      'n’importe quoi',
      'scrypt',
      parts.slice(0, 5).join('$'),
      [...parts, 'en-trop'].join('$'),
      ['bcrypt', ...parts.slice(1)].join('$'),
      ['SCRYPT', ...parts.slice(1)].join('$'),
      PASSWORD,
    ]) {
      await expect(verifyPassword(PASSWORD, bad), bad).resolves.toBe(false)
    }
  })

  it('empreinte aux paramètres illisibles ou hors limites (N, r, p) : faux, sans erreur', async () => {
    const [, , r, p, salt, key] = stored.split('$')
    for (const bad of [
      ['scrypt', 'abc', r, p, salt, key],
      ['scrypt', '16384.5', r, p, salt, key],
      ['scrypt', '-16384', r, p, salt, key],
      ['scrypt', '1', r, p, salt, key],
      ['scrypt', String(2 ** 20), r, p, salt, key],
      ['scrypt', '16384', 'x', p, salt, key],
      ['scrypt', '16384', r, 'x', salt, key],
    ].map((a) => a.join('$'))) {
      await expect(verifyPassword(PASSWORD, bad), bad).resolves.toBe(false)
    }
  })

  it('empreinte vide ou faite de caractères invalides : jamais acceptée, quel que soit le mot de passe', async () => {
    const [, n, r, p, salt] = stored.split('$')
    for (const bad of [['scrypt', n, r, p, salt, ''], ['scrypt', n, r, p, salt, '!!!!'], ['scrypt', n, r, p, salt, '***']].map((a) => a.join('$'))) {
      await expect(verifyPassword(PASSWORD, bad), bad).resolves.toBe(false)
      await expect(verifyPassword('un tout autre mot de passe', bad), bad).resolves.toBe(false)
    }
  })

  it('empreinte ou sel modifié : faux', async () => {
    const [, n, r, p, salt, key] = stored.split('$')
    await expect(verifyPassword(PASSWORD, ['scrypt', n, r, p, flip(salt, 5), key].join('$'))).resolves.toBe(false)
    await expect(verifyPassword(PASSWORD, ['scrypt', n, r, p, salt, flip(key, 5)].join('$'))).resolves.toBe(false)
    await expect(verifyPassword(PASSWORD, ['scrypt', n, r, p, salt, flip(key, 60)].join('$'))).resolves.toBe(false)
  })

  it('empreinte tronquée (abîmée) : jamais acceptée — réduite à un octet, elle laisserait passer un mot de passe sur 256', async () => {
    const [, n, r, p, salt, key] = stored.split('$')
    // 2 caractères base64url = 1 octet ; 20 caractères = 15 octets (au lieu des 64 d'une vraie empreinte)
    for (const length of [2, 20, 80]) {
      await expect(verifyPassword(PASSWORD, ['scrypt', n, r, p, salt, key.slice(0, length)].join('$')), `${length} caractères`).resolves.toBe(false)
    }
  })
})

describe('jetons à usage unique (lien « nouveau mot de passe »)', () => {
  it('jeton de 32 octets aléatoires en base64url, avec son empreinte SHA-256 (seule enregistrée en base)', () => {
    const { token, hash } = newToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashToken(token))
    expect(hash).not.toContain(token)
  })

  it('chaque jeton est différent', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken().token))
    expect(tokens.size).toBe(200)
  })

  it('hashToken : SHA-256 en hexadécimal, toujours la même pour un même jeton', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashToken('jeton')).toBe(hashToken('jeton'))
    expect(hashToken('jeton')).not.toBe(hashToken('Jeton'))
  })
})

describe('sessions signées (cookie sw_membre)', () => {
  beforeEach(() => {
    vi.stubEnv('PAYLOAD_SECRET', SECRET)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('un jeton signé se relit : membre, version de session et échéance', () => {
    const { value, expires } = signSession(42, 3, NOW)
    expect(value).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(expires.getTime()).toBe(NOW + SESSION_DAYS * DAY)
    expect(readSession(value, NOW)).toEqual({ m: 42, s: 3, e: Math.floor(expires.getTime() / 1000) })
  })

  it('la session dure 30 jours (temps simulé, changement d’heure compris)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { value, expires } = signSession(7, 0)
    expect(SESSION_DAYS).toBe(30)
    expect(expires.toISOString()).toBe('2026-11-20T08:00:00.000Z')
    vi.setSystemTime(NOW + 29 * DAY)
    expect(readSession(value)).toEqual({ m: 7, s: 0, e: Math.floor(expires.getTime() / 1000) })
    vi.setSystemTime(expires.getTime() - 1000)
    expect(readSession(value)).not.toBeNull()
    vi.setSystemTime(expires.getTime())
    expect(readSession(value)).toBeNull()
    vi.setSystemTime(expires.getTime() + 365 * DAY)
    expect(readSession(value)).toBeNull()
  })

  it('une signature modifiée est refusée', () => {
    const { value } = signSession(42, 3, NOW)
    const [v, body, sig] = value.split('.')
    for (const bad of [flip(sig, 0), flip(sig, 10), flip(sig, 30), sig.slice(0, 20), '', 'A'.repeat(43)]) {
      expect(readSession(`${v}.${body}.${bad}`, NOW), bad).toBeNull()
    }
    // signature d'une autre session
    const other = signSession(43, 3, NOW).value.split('.')[2]
    expect(readSession(`${v}.${body}.${other}`, NOW)).toBeNull()
  })

  it('des données modifiées sont refusées (autre membre, autre version, échéance repoussée)', () => {
    const { value } = signSession(42, 3, NOW)
    const [v, body, sig] = value.split('.')
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as { m: number; s: number; e: number }
    for (const changed of [{ ...claims, m: 1 }, { ...claims, s: 4 }, { ...claims, e: claims.e + 365 * 24 * 3600 }]) {
      const forgedBody = Buffer.from(JSON.stringify(changed)).toString('base64url')
      expect(readSession(`${v}.${forgedBody}.${sig}`, NOW)).toBeNull()
    }
    expect(readSession(`${v}.${flip(body, 3)}.${sig}`, NOW)).toBeNull()
  })

  it('un jeton signé avec un autre secret est refusé (changer PAYLOAD_SECRET ferme toutes les sessions)', () => {
    const { value } = signSession(42, 3, NOW)
    vi.stubEnv('PAYLOAD_SECRET', 'un-autre-secret')
    expect(readSession(value, NOW)).toBeNull()
    expect(readSession(forge({ m: 42, s: 3, e: NOW / 1000 + 3600 }, 'un-autre-secret'), NOW)).not.toBeNull()
  })

  it('format inconnu : null', () => {
    const { value } = signSession(42, 3, NOW)
    const [, body, sig] = value.split('.')
    for (const bad of [
      '',
      null,
      undefined,
      'abc',
      'v1',
      'v1.',
      'v1..',
      `v1.${body}`,
      `v1.${body}.`,
      `v1..${sig}`,
      `v2.${body}.${sig}`,
      `V1.${body}.${sig}`,
      ` v1.${body}.${sig}`,
      `.${body}.${sig}`,
      `${body}.${sig}`,
      'eyJhbGciOiJIUzI1NiJ9.eyJtIjoxfQ.c2lnbmF0dXJl',
    ]) {
      expect(readSession(bad, NOW), String(bad)).toBeNull()
    }
  })

  it('format inconnu : un segment de plus après la signature est refusé', () => {
    const { value } = signSession(42, 3, NOW)
    expect(readSession(`${value}.en-trop`, NOW)).toBeNull()
  })

  it('valeurs aberrantes refusées, même correctement signées', () => {
    const e = Math.floor(NOW / 1000) + 3600
    // témoin : un jeton fabriqué par le test est bien accepté s'il est correct
    expect(readSession(forge({ m: 1, s: 0, e }), NOW)).toEqual({ m: 1, s: 0, e })
    for (const claims of [
      { m: '1', s: 0, e },
      { m: 1.5, s: 0, e },
      { m: null, s: 0, e },
      { s: 0, e },
      { m: 1, s: '0', e },
      { m: 1, e },
      { m: 1, s: 0, e: String(e) },
      { m: 1, s: 0, e: e + 0.5 },
      { m: 1, s: 0 },
      { m: 1, s: 0, e: null },
      {},
      [],
      'null',
      '"texte"',
      '42',
      'pas du json',
      '{"m":1,"s":0,"e":',
    ]) {
      expect(readSession(forge(claims), NOW), JSON.stringify(claims)).toBeNull()
    }
  })

  it('une échéance passée est refusée, même correctement signée', () => {
    const nowSec = Math.floor(NOW / 1000)
    expect(readSession(forge({ m: 1, s: 0, e: nowSec - 1 }), NOW)).toBeNull()
    expect(readSession(forge({ m: 1, s: 0, e: nowSec }), NOW)).toBeNull()
    expect(readSession(forge({ m: 1, s: 0, e: 0 }), NOW)).toBeNull()
    expect(readSession(forge({ m: 1, s: 0, e: -1 }), NOW)).toBeNull()
    expect(readSession(forge({ m: 1, s: 0, e: nowSec + 1 }), NOW)).not.toBeNull()
  })

  it('sans PAYLOAD_SECRET, la signature échoue avec un message clair', () => {
    vi.stubEnv('PAYLOAD_SECRET', '')
    expect(() => signSession(1, 0, NOW)).toThrow('PAYLOAD_SECRET manquant')
  })
})
