// Commande « Arrêter les aperçus animés » du pied de page (WCAG 2.2.2) : choix lu et écrit dans le stockage local,
// stockage indisponible ou plein, préférences du système qui l'emportent, abonnement du pilote des aperçus (même page et
// autres onglets), rendu serveur neutre (aucune différence d'hydratation). Fenêtre simulée, sans navigateur.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWindow } from './regles-composants/outils'

const KEY = 'swatter-apercus'
const REDUCED = '(prefers-reduced-motion: reduce)'

/** Fenêtre simulée : stockage local, événements et matchMedia (« réduire les animations » réglable). */
function fakeBrowser() {
  const reduced = Object.assign(new EventTarget(), { matches: false })
  const other = Object.assign(new EventTarget(), { matches: false })
  const win = Object.assign(fakeWindow(), { matchMedia: (query: string) => (query === REDUCED ? reduced : other) })
  return { win, reduced }
}

let win: ReturnType<typeof fakeBrowser>['win']
let reduced: ReturnType<typeof fakeBrowser>['reduced']
/** Module rechargé à chaque test : le choix gardé pour la page (stockage refusé) ne passe pas d'un test à l'autre. */
const load = () => import('@/components/video/motion')
/** Événements « swatter:apercus » reçus. */
const events = (name: string) => {
  const seen: Event[] = []
  win.addEventListener(name, (e) => seen.push(e))
  return seen
}

beforeEach(() => {
  vi.resetModules()
  const browser = fakeBrowser()
  win = browser.win
  reduced = browser.reduced
  vi.stubGlobal('window', win)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('choix de l’internaute (previewsStopped, setPreviewsStopped)', () => {
  it('clé du stockage et événement de la page', async () => {
    const { PREVIEWS_EVENT, PREVIEWS_KEY } = await load()
    expect(PREVIEWS_KEY).toBe(KEY)
    expect(PREVIEWS_EVENT).toBe('swatter:apercus')
  })

  it('sans choix : les aperçus tournent (comportement par défaut voulu par le client)', async () => {
    const { previewsAllowed, previewsStopped } = await load()
    expect(previewsStopped()).toBe(false)
    expect(previewsAllowed()).toBe(true)
  })

  it('arrêt puis relance : choix écrit, relu, et la page prévenue à chaque fois', async () => {
    const { PREVIEWS_EVENT, previewsAllowed, previewsStopped, setPreviewsStopped } = await load()
    const seen = events(PREVIEWS_EVENT)
    setPreviewsStopped(true)
    expect(win.localStorage.getItem(KEY)).toBe('arretes')
    expect(previewsStopped()).toBe(true)
    expect(previewsAllowed()).toBe(false)
    setPreviewsStopped(false)
    expect(win.localStorage.getItem(KEY)).toBeNull()
    expect(previewsStopped()).toBe(false)
    expect(previewsAllowed()).toBe(true)
    expect(seen).toHaveLength(2)
  })

  it('choix enregistré lors d’une visite précédente : relu au chargement ; une autre valeur ne compte pas', async () => {
    win.localStorage.setItem(KEY, 'arretes')
    const { previewsStopped } = await load()
    expect(previewsStopped()).toBe(true)
    for (const value of ['1', 'true', 'oui', '']) {
      win.localStorage.setItem(KEY, value)
      expect(previewsStopped(), value).toBe(false)
    }
  })

  it('stockage illisible (navigation privée stricte) : aperçus en marche, sans erreur', async () => {
    win.localStorage.setItem(KEY, 'arretes')
    win.localStorage.blocked.read = true
    const { previewsAllowed, previewsStopped } = await load()
    expect(() => previewsStopped()).not.toThrow()
    expect(previewsStopped()).toBe(false)
    expect(previewsAllowed()).toBe(true)
  })

  it('stockage bloqué ou plein : le clic vaut pour la page en cours (et la page est prévenue quand même)', async () => {
    win.localStorage.blocked = { read: true, write: true }
    const { PREVIEWS_EVENT, previewsStopped, setPreviewsStopped } = await load()
    const seen = events(PREVIEWS_EVENT)
    expect(() => setPreviewsStopped(true)).not.toThrow()
    expect(previewsStopped()).toBe(true)
    setPreviewsStopped(false)
    expect(previewsStopped()).toBe(false)
    expect(seen).toHaveLength(2)
  })

  it('stockage plein seulement (lecture possible) : l’arrêt vaut pour la page, la relance efface l’arrêt enregistré', async () => {
    win.localStorage.blocked.write = true
    const { previewsStopped, setPreviewsStopped } = await load()
    setPreviewsStopped(true)
    expect(win.localStorage.getItem(KEY)).toBeNull()
    expect(previewsStopped()).toBe(true)
    setPreviewsStopped(false)
    expect(previewsStopped()).toBe(false)
  })

  it('« réduire les animations » : aperçus interdits quel que soit le choix ; le direct, lui, ne dépend pas du choix', async () => {
    const { autoplayAllowed, previewsAllowed, setPreviewsStopped } = await load()
    reduced.matches = true
    expect(previewsAllowed()).toBe(false)
    expect(autoplayAllowed()).toBe(false)
    reduced.matches = false
    setPreviewsStopped(true)
    expect(previewsAllowed()).toBe(false)
    // lecture automatique du direct (VideoPlayer) : seulement les préférences du système
    expect(autoplayAllowed()).toBe(true)
  })
})

describe('abonnement (onAutoplayPrefsChange) : le pilote des aperçus et le bouton sont prévenus aussitôt', () => {
  it('commande de la page, autre onglet (storage), « réduire les animations » ; autre clé ignorée ; désabonnement', async () => {
    const { onAutoplayPrefsChange, previewsStopped, setPreviewsStopped } = await load()
    const states: boolean[] = []
    const off = onAutoplayPrefsChange(() => states.push(previewsStopped()))

    setPreviewsStopped(true)
    setPreviewsStopped(false)
    // autre onglet : arrêt enregistré, la page reçoit « storage »
    win.localStorage.setItem(KEY, 'arretes')
    win.dispatchEvent(Object.assign(new Event('storage'), { key: KEY }))
    // autre onglet : localStorage.clear() (clé null)
    win.localStorage.clear()
    win.dispatchEvent(Object.assign(new Event('storage'), { key: null }))
    // une autre clé du stockage : ignorée
    win.dispatchEvent(Object.assign(new Event('storage'), { key: 'swatter-consent' }))
    // préférence du système changée
    reduced.dispatchEvent(new Event('change'))

    off()
    setPreviewsStopped(true)
    reduced.dispatchEvent(new Event('change'))
    win.dispatchEvent(Object.assign(new Event('storage'), { key: KEY }))

    expect(states).toEqual([true, false, true, false, false])
  })

  it('autre onglet après un clic gardé pour la page (stockage plein) : le choix le plus récent l’emporte', async () => {
    win.localStorage.blocked.write = true
    const { onAutoplayPrefsChange, previewsStopped, setPreviewsStopped } = await load()
    onAutoplayPrefsChange(() => {})
    setPreviewsStopped(true)
    expect(previewsStopped()).toBe(true)
    // l'autre onglet a relancé (clé retirée) : la page suit
    win.dispatchEvent(Object.assign(new Event('storage'), { key: KEY }))
    expect(previewsStopped()).toBe(false)
  })
})

describe('rendu serveur', () => {
  it('usePreviewsStopped vaut false au premier rendu (serveur et hydratation), même avec un arrêt enregistré', async () => {
    win.localStorage.setItem(KEY, 'arretes')
    const { usePreviewsStopped } = await load()
    const Probe = () => createElement('span', null, String(usePreviewsStopped()))
    expect(renderToString(createElement(Probe))).toBe('<span>false</span>')
  })

  it('la commande du pied de page n’existe pas dans le HTML du serveur (elle n’agit qu’une fois la page hydratée)', async () => {
    const { PreviewsToggle } = await import('@/components/video/PreviewsToggle')
    expect(renderToString(createElement(PreviewsToggle))).toBe('')
  })
})
