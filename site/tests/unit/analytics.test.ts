// Mesure d'audience (Google Analytics 4) : ID de mesure accepté, file de commandes gtag (accord, signaux Google et
// publicité désactivés, une seule configuration par page), script chargé une fois, envoi coupé et cookies effacés au
// retrait de l'accord. Fenêtre et document simulés, sans navigateur.
import { describe, expect, it } from 'vitest'
import { clearGaCookies, GTAG_SRC, initGtag, loadGtag, setMeasurement, type GtagWindow } from '@/components/analytics/gtag'
import { isMeasurementId, normalizeMeasurementId } from '@/lib/analytics'

const ID = 'G-AB12CD34EF'

/** Commandes reçues par la file de gtag, sous forme de tableaux (chaque entrée est un objet `arguments`). */
const commands = (win: GtagWindow) => (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))

describe('ID de mesure de Google Analytics', () => {
  it('format GA4 accepté : « G- » puis des lettres majuscules et des chiffres', () => {
    for (const id of ['G-AB12CD34EF', 'G-1234', 'G-ABCDEFGHIJKLMNOP']) expect(isMeasurementId(id), id).toBe(true)
  })

  it('tout le reste est refusé, en particulier ce qui pourrait sortir de l’adresse du script ou de la commande', () => {
    for (const id of ['', 'G-', 'G-ABC', 'UA-12345-1', 'GTM-AB12CD', 'g-ab12cd34ef', ' G-AB12CD34EF', 'G-AB12 CD34', 'G-AB12CD34EF"><script>', "G-AB12');alert(1)//", 'G-ABCDEFGHIJKLMNOPQ']) {
      expect(isMeasurementId(id), id).toBe(false)
    }
    for (const value of [null, undefined, 1234, {}, ['G-AB12CD34EF']]) expect(isMeasurementId(value), String(value)).toBe(false)
  })

  it('saisie nettoyée avant la vérification : espaces retirés, majuscules', () => {
    expect(normalizeMeasurementId('  g-ab12cd34ef \n')).toBe(ID)
    expect(isMeasurementId(normalizeMeasurementId(' g-ab12cd34ef '))).toBe(true)
    expect(normalizeMeasurementId(null)).toBeNull()
    expect(normalizeMeasurementId(42)).toBe(42)
  })
})

describe('initGtag : file de commandes et configuration', () => {
  it('accord pour la mesure d’audience, refus de toute publicité, puis configuration sans signaux Google', () => {
    const win: GtagWindow = {}
    const gtag = initGtag(win, ID)
    expect(win.gtag).toBe(gtag)
    const [consent, js, config] = commands(win)
    expect(consent).toEqual(['consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }])
    expect(js[0]).toBe('js')
    expect(js[1]).toBeInstanceOf(Date)
    expect(config).toEqual(['config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false }])
  })

  it('chaque entrée de la file est un objet « arguments », seul format lu par gtag.js (pas un tableau)', () => {
    const win: GtagWindow = {}
    initGtag(win, ID)
    for (const entry of win.dataLayer ?? []) {
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]')
      expect(Array.isArray(entry)).toBe(false)
    }
  })

  it('une seule configuration (donc une seule page vue initiale) par page, même appelée plusieurs fois', () => {
    const win: GtagWindow = {}
    initGtag(win, ID)
    initGtag(win, ID)
    expect(commands(win).filter((c) => c[0] === 'config')).toHaveLength(1)
    // autre identifiant (réglage changé) : configuré à son tour
    initGtag(win, 'G-ZZ99ZZ99ZZ')
    expect(commands(win).filter((c) => c[0] === 'config').map((c) => c[1])).toEqual([ID, 'G-ZZ99ZZ99ZZ'])
  })

  it('file et fonction déjà présentes (autre script) : réutilisées, rien n’est perdu', () => {
    const earlier = { 0: 'event', 1: 'avant', length: 2 }
    const win: GtagWindow = { dataLayer: [earlier] }
    initGtag(win, ID)
    expect(win.dataLayer?.[0]).toBe(earlier)
    expect(commands(win)).toHaveLength(4)
  })
})

describe('loadGtag : script gtag.js', () => {
  function fakeDocument() {
    const appended: { async: boolean; src: string; dataset: Record<string, string | undefined> }[] = []
    return {
      appended,
      querySelector: (selector: string) => (selector === 'script[data-swatter-ga]' ? (appended[0] ?? null) : null),
      createElement: () => ({ async: false, src: '', dataset: {} as Record<string, string | undefined> }),
      head: { appendChild: (node: never) => appended.push(node) },
    }
  }

  it('script asynchrone, adresse de Google avec l’identifiant, ajouté une seule fois', () => {
    const doc = fakeDocument()
    loadGtag(doc, ID)
    loadGtag(doc, ID)
    expect(doc.appended).toHaveLength(1)
    expect(doc.appended[0]).toMatchObject({ async: true, src: `${GTAG_SRC}?id=${ID}`, dataset: { swatterGa: ID } })
    expect(GTAG_SRC).toBe('https://www.googletagmanager.com/gtag/js')
  })
})

describe('setMeasurement : envoi autorisé ou coupé', () => {
  it('drapeau « ga-disable-<ID> » reconnu par gtag.js, et accord transmis à gtag une fois chargé', () => {
    const win: GtagWindow = {}
    setMeasurement(win, ID, false)
    expect(win[`ga-disable-${ID}`]).toBe(true)
    initGtag(win, ID)
    setMeasurement(win, ID, true)
    expect(win[`ga-disable-${ID}`]).toBe(false)
    setMeasurement(win, ID, false)
    expect(win[`ga-disable-${ID}`]).toBe(true)
    expect(commands(win).filter((c) => c[0] === 'consent' && c[1] === 'update')).toEqual([
      ['consent', 'update', { analytics_storage: 'granted' }],
      ['consent', 'update', { analytics_storage: 'denied' }],
    ])
  })
})

describe('clearGaCookies : cookies effacés au retrait de l’accord', () => {
  function fakeCookies(initial: string) {
    const written: string[] = []
    return {
      written,
      get cookie() {
        return initial
      },
      set cookie(value: string) {
        written.push(value)
      },
    }
  }

  it('cookies de Google Analytics effacés sur le nom d’hôte et le domaine principal ; les autres cookies intacts', () => {
    const doc = fakeCookies('swatter-consent=x; _ga=GA1.1.123.456; sw_membre=jeton; _ga_AB12CD34EF=GS1.1.1; _gid=GA1.2.3; _gat_UA-1=1; _gaz=1')
    expect(clearGaCookies(doc, 'www.swatter-tv.fr')).toEqual(['_ga', '_ga_AB12CD34EF', '_gid', '_gat_UA-1'])
    const expired = (name: string, domain?: string) => `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`
    for (const name of ['_ga', '_ga_AB12CD34EF', '_gid', '_gat_UA-1']) {
      for (const domain of [undefined, 'www.swatter-tv.fr', '.www.swatter-tv.fr', 'swatter-tv.fr', '.swatter-tv.fr']) {
        expect(doc.written, `${name} ${domain ?? '(sans domaine)'}`).toContain(expired(name, domain))
      }
    }
    // jamais le seul suffixe « fr », ni les cookies du site
    expect(doc.written.some((w) => /domain=\.?fr$/.test(w))).toBe(false)
    expect(doc.written.some((w) => /^(swatter-consent|sw_membre|_gaz)=/.test(w))).toBe(false)
  })

  it('site en local (localhost) : effacement sans domaine ; aucun cookie de Google : rien n’est écrit', () => {
    const local = fakeCookies('_ga=GA1.1.1.1')
    clearGaCookies(local, 'localhost')
    expect(local.written).toEqual(['_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'])
    const none = fakeCookies('swatter-consent=x')
    expect(clearGaCookies(none, 'www.swatter-tv.fr')).toEqual([])
    expect(none.written).toEqual([])
  })
})
