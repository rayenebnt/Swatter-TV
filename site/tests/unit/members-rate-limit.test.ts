// Limites anti-abus de l'espace membres et du formulaire de contact (src/lib/members/rate-limit.ts) : adresse IP du
// visiteur derrière le reverse proxy, fenêtre glissante (temps simulé), compteurs séparés, ménage de la mémoire, facteur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allow, allowKey, clientIp, rateFactor } from '@/lib/members/rate-limit'

const T0 = Date.parse('2026-10-21T10:00:00.000Z')
const W = 60_000

let counter = 0
/** Nom de limite propre à chaque test : les compteurs (mémoire du module) ne passent pas d'un test à l'autre. */
const fresh = (label: string) => `${label}-${++counter}`
const xff = (value: string) => new Headers({ 'x-forwarded-for': value })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('clientIp : adresse du visiteur', () => {
  beforeEach(() => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', undefined)
  })

  it('lit le dernier maillon de X-Forwarded-For, celui qu’écrit le reverse proxy', () => {
    expect(clientIp(xff('203.0.113.5'))).toBe('203.0.113.5')
    expect(clientIp(xff('198.51.100.7, 203.0.113.5'))).toBe('203.0.113.5')
    expect(clientIp(xff('faux-1, faux-2, faux-3, 203.0.113.5'))).toBe('203.0.113.5')
  })

  it('ignore les espaces et les maillons vides', () => {
    expect(clientIp(xff('  198.51.100.7 ,  , 203.0.113.5 , '))).toBe('203.0.113.5')
    expect(clientIp(xff('2001:db8::1'))).toBe('2001:db8::1')
  })

  it('TRUSTED_PROXY_HOPS=2 (CDN puis Caddy) : l’avant-dernier maillon, celui écrit par le CDN', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2')
    expect(clientIp(xff('faux, 203.0.113.5, 198.51.100.1'))).toBe('203.0.113.5')
    expect(clientIp(xff('203.0.113.5, 198.51.100.1'))).toBe('203.0.113.5')
    // un seul maillon : on ne remonte pas au-delà du début de la chaîne
    expect(clientIp(xff('203.0.113.5'))).toBe('203.0.113.5')
  })

  it('TRUSTED_PROXY_HOPS=3 : trois proxys de confiance', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '3')
    expect(clientIp(xff('faux, 203.0.113.5, 198.51.100.1, 198.51.100.2'))).toBe('203.0.113.5')
  })

  it('valeur absente ou invalide de TRUSTED_PROXY_HOPS : un seul proxy', () => {
    for (const hops of [undefined, '', '0', '-1', '-2', 'abc', '1.7', 'NaN']) {
      vi.stubEnv('TRUSTED_PROXY_HOPS', hops)
      expect(clientIp(xff('faux, 203.0.113.5, 198.51.100.1')), String(hops)).toBe('198.51.100.1')
    }
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2.9')
    expect(clientIp(xff('faux, 203.0.113.5, 198.51.100.1'))).toBe('203.0.113.5')
  })

  it('sans X-Forwarded-For : l’en-tête X-Real-IP', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '192.0.2.10' }))).toBe('192.0.2.10')
    expect(clientIp(new Headers({ 'x-forwarded-for': ' , ,', 'x-real-ip': '192.0.2.10' }))).toBe('192.0.2.10')
    // X-Forwarded-For présent : il l'emporte
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.5', 'x-real-ip': '192.0.2.10' }))).toBe('203.0.113.5')
  })

  it('sans aucune indication : « inconnue »', () => {
    expect(clientIp(new Headers())).toBe('inconnue')
    expect(clientIp(xff(''))).toBe('inconnue')
    expect(clientIp(xff(' , '))).toBe('inconnue')
  })
})

describe('allow / allowKey : fenêtre glissante (temps simulé)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })

  it('permet `max` actions par fenêtre, puis refuse', () => {
    const name = fresh('max')
    expect([1, 2, 3].map(() => allowKey(name, 'k', 3, W))).toEqual([true, true, true])
    expect(allowKey(name, 'k', 3, W)).toBe(false)
    expect(allowKey(name, 'k', 3, W)).toBe(false)
  })

  it('chaque action compte pendant exactement `windowMs`, puis libère une place', () => {
    const name = fresh('glissante')
    expect(allowKey(name, 'k', 3, 1000)).toBe(true)
    vi.setSystemTime(T0 + 300)
    expect(allowKey(name, 'k', 3, 1000)).toBe(true)
    vi.setSystemTime(T0 + 600)
    expect(allowKey(name, 'k', 3, 1000)).toBe(true)
    vi.setSystemTime(T0 + 999)
    expect(allowKey(name, 'k', 3, 1000)).toBe(false)
    vi.setSystemTime(T0 + 1000)
    // l'action de T0 n'est plus comptée
    expect(allowKey(name, 'k', 3, 1000)).toBe(true)
    vi.setSystemTime(T0 + 1001)
    expect(allowKey(name, 'k', 3, 1000)).toBe(false)
    vi.setSystemTime(T0 + 1299)
    expect(allowKey(name, 'k', 3, 1000)).toBe(false)
    vi.setSystemTime(T0 + 1300)
    expect(allowKey(name, 'k', 3, 1000)).toBe(true)
  })

  it('un essai refusé n’est pas compté : il ne prolonge pas le blocage', () => {
    const name = fresh('refus')
    expect(allowKey(name, 'k', 2, 1000)).toBe(true)
    expect(allowKey(name, 'k', 2, 1000)).toBe(true)
    for (let t = 100; t < 1000; t += 100) {
      vi.setSystemTime(T0 + t)
      expect(allowKey(name, 'k', 2, 1000)).toBe(false)
    }
    vi.setSystemTime(T0 + 1000)
    expect(allowKey(name, 'k', 2, 1000)).toBe(true)
  })

  it('compteurs séparés par nom de limite', () => {
    const a = fresh('connexion')
    const b = fresh('inscription')
    expect(allowKey(a, 'k', 1, W)).toBe(true)
    expect(allowKey(b, 'k', 1, W)).toBe(true)
    expect(allowKey(a, 'k', 1, W)).toBe(false)
    expect(allowKey(b, 'k', 1, W)).toBe(false)
  })

  it('compteurs séparés par clé', () => {
    const name = fresh('cles')
    expect(allowKey(name, 'jean@exemple.fr', 1, W)).toBe(true)
    expect(allowKey(name, 'paul@exemple.fr', 1, W)).toBe(true)
    expect(allowKey(name, 'jean@exemple.fr', 1, W)).toBe(false)
    expect(allowKey(name, 'paul@exemple.fr', 1, W)).toBe(false)
  })

  it('allow compte par adresse IP du visiteur (dernier maillon de X-Forwarded-For)', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', undefined)
    const name = fresh('ip')
    expect(allow(name, xff('203.0.113.1'), 2, W)).toBe(true)
    expect(allow(name, xff('203.0.113.1'), 2, W)).toBe(true)
    expect(allow(name, xff('203.0.113.1'), 2, W)).toBe(false)
    expect(allow(name, xff('203.0.113.2'), 2, W)).toBe(true)
    // le même compteur que allowKey sur cette adresse
    expect(allowKey(name, '203.0.113.2', 2, W)).toBe(true)
    expect(allow(name, xff('203.0.113.2'), 2, W)).toBe(false)
  })

  it('un visiteur ne contourne pas la limite en inventant des maillons devant celui du proxy', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', undefined)
    const name = fresh('contournement')
    expect(allow(name, xff('1.1.1.1, 203.0.113.9'), 1, W)).toBe(true)
    expect(allow(name, xff('2.2.2.2, 203.0.113.9'), 1, W)).toBe(false)
    expect(allow(name, xff('3.3.3.3, 4.4.4.4, 203.0.113.9'), 1, W)).toBe(false)
  })

  it('les requêtes sans adresse partagent le compteur « inconnue »', () => {
    const name = fresh('inconnue')
    expect(allow(name, new Headers(), 1, W)).toBe(true)
    expect(allow(name, new Headers({ 'user-agent': 'autre' }), 1, W)).toBe(false)
  })
})

describe('allowKey : ménage de la mémoire au-delà de 10 000 clés', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })

  it('les clés dont la fenêtre est passée sont effacées, les compteurs encore actifs sont gardés', () => {
    const name = fresh('menage')
    for (let i = 0; i < 9_999; i++) allowKey(name, `ancienne-${i}`, 1, 1000)
    vi.setSystemTime(T0 + 500)
    expect(allowKey(name, 'cible', 1, 1000)).toBe(true)
    // 10 001e clé, quand les 9 999 premières ont fini leur fenêtre : ménage
    vi.setSystemTime(T0 + 1000)
    expect(allowKey(name, 'nouvelle', 1, 1000)).toBe(true)
    expect(allowKey(name, 'cible', 1, 1000)).toBe(false)
    expect(allowKey(name, 'nouvelle', 1, 1000)).toBe(false)
  })

  it('en dernier recours (10 000 clés encore actives), tout est effacé', () => {
    const name = fresh('dernier-recours')
    expect(allowKey(name, 'cible', 1, W)).toBe(true)
    expect(allowKey(name, 'cible', 1, W)).toBe(false)
    for (let i = 0; i < 10_000; i++) allowKey(name, `active-${i}`, 1, W)
    expect(allowKey(name, 'cible', 1, W)).toBe(true)
  })

  it('le ménage d’une limite ne touche pas aux autres', () => {
    const name = fresh('pleine')
    const other = fresh('voisine')
    expect(allowKey(other, 'cible', 1, W)).toBe(true)
    for (let i = 0; i < 10_001; i++) allowKey(name, `active-${i}`, 1, W)
    expect(allowKey(other, 'cible', 1, W)).toBe(false)
  })
})

describe('rateFactor : MEMBER_RATE_FACTOR (tests de bout en bout)', () => {
  it('1 par défaut', () => {
    vi.stubEnv('MEMBER_RATE_FACTOR', undefined)
    expect(rateFactor()).toBe(1)
    vi.stubEnv('MEMBER_RATE_FACTOR', '')
    expect(rateFactor()).toBe(1)
  })

  it('multiplie les limites', () => {
    vi.stubEnv('MEMBER_RATE_FACTOR', '10')
    expect(rateFactor()).toBe(10)
    vi.stubEnv('MEMBER_RATE_FACTOR', '2.5')
    expect(rateFactor()).toBe(2.5)
  })

  it('ne peut jamais abaisser les limites ni les annuler (valeur nulle, négative, inférieure à 1 ou illisible)', () => {
    for (const v of ['0', '-5', '0.5', 'abc', 'NaN']) {
      vi.stubEnv('MEMBER_RATE_FACTOR', v)
      expect(rateFactor(), v).toBe(1)
    }
  })
})
