// Consentement aux cookies (src/components/layout/consent.ts) : lecture et écriture du choix dans le stockage local,
// valeurs corrompues, expiration après 13 mois (CNIL), stockage bloqué, événements partagés entre rubriques et onglets.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWindow } from './outils'

const NOW = new Date('2026-10-21T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const KEY = 'swatter-consent'

let win: ReturnType<typeof fakeWindow>
/** Module rechargé à chaque test : le choix gardé en mémoire (stockage bloqué) ne passe pas d'un test à l'autre. */
const load = () => import('@/components/layout/consent')
const stored = (value: unknown) => win.localStorage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value))
const choice = (over: Record<string, unknown> = {}) => ({ v: 1, audience: true, externes: false, date: '2026-10-01T08:00:00.000Z', ...over })

beforeEach(() => {
  vi.resetModules()
  win = fakeWindow()
  vi.stubGlobal('window', win)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('contrat du consentement', () => {
  it('clé de stockage et noms des événements partagés', async () => {
    const { CONSENT_EVENT, CONSENT_KEY, COOKIES_EVENT } = await load()
    expect(CONSENT_KEY).toBe(KEY)
    expect(CONSENT_EVENT).toBe('swatter:consent')
    expect(COOKIES_EVENT).toBe('swatter:cookies')
  })
})

describe('lecture du choix (readConsent)', () => {
  it('rendu serveur (pas de fenêtre) : aucun choix', async () => {
    vi.unstubAllGlobals()
    const { readConsent } = await load()
    expect(readConsent()).toBeNull()
  })

  it('aucun choix enregistré : null, donc tout est refusé', async () => {
    const { readConsent } = await load()
    expect(readConsent()).toBeNull()
  })

  it('choix valide : relu tel quel, sans les champs inconnus', async () => {
    stored({ ...choice({ audience: false, externes: true }), publicite: true })
    const { readConsent } = await load()
    expect(readConsent()).toEqual({ v: 1, audience: false, externes: true, date: '2026-10-01T08:00:00.000Z' })
  })

  it('valeurs corrompues ou d’une autre version : ignorées (le bandeau est reproposé)', async () => {
    const { readConsent } = await load()
    const bad: unknown[] = [
      '{',
      'null',
      '42',
      '"oui"',
      'true',
      '[]',
      '[1, true, false]',
      choice({ v: 2 }),
      choice({ v: '1' }),
      choice({ audience: 'true' }),
      choice({ externes: 1 }),
      choice({ externes: undefined }),
      choice({ date: 1760000000000 }),
      choice({ date: 'pas une date' }),
      choice({ date: '' }),
      { audience: true, externes: true },
    ]
    for (const value of bad) {
      stored(value)
      expect(readConsent(), JSON.stringify(value)).toBeNull()
    }
  })

  it('choix de plus de 13 mois (395 jours) : expiré', async () => {
    const { readConsent } = await load()
    const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
    stored(choice({ date: ago(394) }))
    expect(readConsent()).not.toBeNull()
    stored(choice({ date: ago(395) }))
    expect(readConsent()).not.toBeNull()
    stored(choice({ date: new Date(NOW.getTime() - 395 * DAY - 1000).toISOString() }))
    expect(readConsent()).toBeNull()
    stored(choice({ date: ago(800) }))
    expect(readConsent()).toBeNull()
  })

  it('le même choix expire avec le temps qui passe', async () => {
    stored(choice({ date: NOW.toISOString() }))
    const { readConsent } = await load()
    expect(readConsent()).not.toBeNull()
    vi.setSystemTime(new Date(NOW.getTime() + 396 * DAY))
    expect(readConsent()).toBeNull()
  })

  it('stockage inaccessible (navigation privée stricte) : null, sans erreur', async () => {
    stored(choice())
    win.localStorage.blocked.read = true
    const { readConsent } = await load()
    expect(() => readConsent()).not.toThrow()
    expect(readConsent()).toBeNull()
  })
})

describe('enregistrement du choix (writeConsent)', () => {
  it('enregistre { v: 1, audience, externes, date } et le relit', async () => {
    const { readConsent, writeConsent } = await load()
    const saved = writeConsent({ audience: true, externes: false })
    expect(saved).toEqual({ v: 1, audience: true, externes: false, date: NOW.toISOString() })
    expect(JSON.parse(win.localStorage.getItem(KEY) ?? 'null')).toEqual(saved)
    expect(readConsent()).toEqual(saved)
  })

  it('ne garde que les deux réponses (rien d’autre ne s’enregistre)', async () => {
    const { writeConsent } = await load()
    const input = { audience: false, externes: true, v: 2, date: '2000-01-01T00:00:00.000Z', pub: true }
    const saved = writeConsent(input as { audience: boolean; externes: boolean })
    expect(saved).toEqual({ v: 1, audience: false, externes: true, date: NOW.toISOString() })
  })

  it('prévient toutes les rubriques : événement « swatter:consent » avec le choix complet', async () => {
    const { CONSENT_EVENT, writeConsent } = await load()
    const details: unknown[] = []
    win.addEventListener(CONSENT_EVENT, (e) => details.push((e as CustomEvent).detail))
    const saved = writeConsent({ audience: false, externes: false })
    expect(details).toEqual([saved])
  })

  it('stockage bloqué : le choix vaut pour la page en cours (et l’événement part quand même)', async () => {
    win.localStorage.blocked = { read: true, write: true }
    const { CONSENT_EVENT, readConsent, writeConsent } = await load()
    const details: unknown[] = []
    win.addEventListener(CONSENT_EVENT, (e) => details.push((e as CustomEvent).detail))
    let saved: unknown
    expect(() => (saved = writeConsent({ audience: false, externes: true }))).not.toThrow()
    expect(readConsent()).toEqual(saved)
    expect(details).toEqual([saved])
  })

  it('stockage plein (écriture refusée) avec un ancien choix encore lisible : le nouveau choix l’emporte sur la page', async () => {
    // ancien choix : tout accepté ; le visiteur refuse ensuite tout, mais le stockage n'accepte plus d'écriture
    stored(choice({ audience: true, externes: true }))
    win.localStorage.blocked.write = true
    const { readConsent, writeConsent } = await load()
    const refused = writeConsent({ audience: false, externes: false })
    expect(readConsent()).toEqual(refused)
  })
})

describe('abonnements et bandeau', () => {
  it('onConsentChange : choix fait sur la page, dans un autre onglet (storage), stockage vidé ; désabonnement', async () => {
    const { CONSENT_EVENT, onConsentChange, writeConsent } = await load()
    const calls: unknown[] = []
    const off = onConsentChange((c) => calls.push(c))

    const saved = writeConsent({ audience: true, externes: true })
    // autre onglet : le stockage change, la page reçoit « storage »
    const other = choice({ audience: false, externes: true, date: NOW.toISOString() })
    stored(other)
    win.dispatchEvent(Object.assign(new Event('storage'), { key: KEY }))
    // autre onglet : localStorage.clear() (clé null) ; le choix n'existe plus
    win.localStorage.clear()
    win.dispatchEvent(Object.assign(new Event('storage'), { key: null }))
    // une autre clé du stockage : ignorée
    win.dispatchEvent(Object.assign(new Event('storage'), { key: 'autre-cle' }))
    // événement émis sans détail : relecture du stockage
    win.dispatchEvent(new Event(CONSENT_EVENT))

    off()
    writeConsent({ audience: false, externes: false })
    win.dispatchEvent(Object.assign(new Event('storage'), { key: KEY }))

    expect(calls).toEqual([saved, other, null, null])
  })

  it('openCookieSettings : rouvre le bandeau (« swatter:cookies ») en mémorisant le bouton pour le focus', async () => {
    const { COOKIES_EVENT, openCookieSettings } = await load()
    const details: unknown[] = []
    win.addEventListener(COOKIES_EVENT, (e) => details.push((e as CustomEvent).detail))
    const button = { id: 'gestion-cookies' } as unknown as HTMLElement
    openCookieSettings(button)
    openCookieSettings()
    expect(details).toEqual([{ trigger: button }, { trigger: undefined }])
  })

  it('useConsent : null au premier rendu (serveur et hydratation), même si un choix est enregistré', async () => {
    stored(choice({ date: NOW.toISOString() }))
    const { useConsent } = await load()
    const Probe = () => createElement('span', null, JSON.stringify(useConsent()))
    expect(renderToString(createElement(Probe))).toBe('<span>null</span>')
  })
})
