// Navigation de la coque (src/components/layout/nav.ts) : rubriques dans l'ordre de l'accueil, rubrique active (adresse
// courante et sous-pages) et événements d'ouverture du menu mobile (fausse fenêtre du navigateur).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAWER_NAV, DRAWER_STATE_EVENT, isActive, MAIN_NAV, OPEN_DRAWER_EVENT, onDrawerState, openDrawer } from '@/components/layout/nav'
import { fakeWindow } from './outils'

describe('rubriques du menu du site', () => {
  it('dans l’ordre de la page d’accueil, de haut en bas', () => {
    expect(MAIN_NAV.map((i) => [i.href, i.label])).toEqual([
      ['/', 'Accueil'],
      ['/direct', 'Le Direct'],
      ['/videos', 'Vidéos'],
      ['/info', 'L’Info'],
      ['/meteo', 'La Météo'],
      ['/programme-tv', 'Programme TV'],
      ['/agenda', 'Agenda'],
      ['/webcams', 'Webcams'],
      ['/replay', 'Le Replay'],
    ])
  })

  it('seul le direct porte le témoin « en direct »', () => {
    expect(MAIN_NAV.filter((i) => i.live).map((i) => i.href)).toEqual(['/direct'])
    for (const item of [...MAIN_NAV, ...DRAWER_NAV]) expect(Object.keys(item).every((k) => ['href', 'label', 'live'].includes(k))).toBe(true)
  })

  it('le menu mobile reprend toutes les rubriques de l’en-tête, dans le même ordre', () => {
    const drawer = DRAWER_NAV.map((i) => i.href)
    const main = MAIN_NAV.map((i) => i.href)
    expect(drawer.filter((href) => main.includes(href))).toEqual(main)
    expect(new Set(drawer).size).toBe(drawer.length)
  })
})

describe('rubrique active (isActive)', () => {
  it('l’accueil n’est actif que sur « / »', () => {
    expect(isActive('/', '/')).toBe(true)
    expect(isActive('/info', '/')).toBe(false)
    expect(isActive('/recherche', '/')).toBe(false)
  })

  it('une rubrique est active sur sa page et sur toutes ses sous-pages', () => {
    expect(isActive('/info', '/info')).toBe(true)
    expect(isActive('/info/savoie', '/info')).toBe(true)
    expect(isActive('/info/savoie/un-article', '/info')).toBe(true)
    expect(isActive('/meteo/isere', '/meteo')).toBe(true)
    expect(isActive('/webcams/plus', '/webcams')).toBe(true)
    expect(isActive('/replay/le-journal-14-octobre', '/replay')).toBe(true)
    expect(isActive('/videos/', '/videos')).toBe(true)
  })

  it('une adresse qui commence seulement par les mêmes lettres n’active pas la rubrique', () => {
    expect(isActive('/informations-legales', '/info')).toBe(false)
    expect(isActive('/directives', '/direct')).toBe(false)
    expect(isActive('/replays', '/replay')).toBe(false)
    expect(isActive('/programme-tv', '/programme')).toBe(false)
  })

  it('sans adresse (rendu sans routeur) : aucune rubrique active', () => {
    expect(isActive(null, '/')).toBe(false)
    expect(isActive(null, '/info')).toBe(false)
    expect(isActive('', '/info')).toBe(false)
  })

  it('exactement une rubrique allumée par page de rubrique, aucune ailleurs', () => {
    const active = (pathname: string) => MAIN_NAV.filter((i) => isActive(pathname, i.href)).map((i) => i.href)
    expect(active('/')).toEqual(['/'])
    expect(active('/direct')).toEqual(['/direct'])
    expect(active('/agenda/fete-du-lac')).toEqual(['/agenda'])
    expect(active('/programme-tv')).toEqual(['/programme-tv'])
    for (const other of ['/recherche', '/contact', '/compte/ma-liste', '/mentions-legales', '/connexion']) expect(active(other)).toEqual([])
  })
})

describe('menu mobile : événements partagés', () => {
  let win: ReturnType<typeof fakeWindow>

  beforeEach(() => {
    win = fakeWindow()
    vi.stubGlobal('window', win)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('openDrawer émet « swatter:open-drawer » avec le bouton qui doit retrouver le focus', () => {
    const seen: unknown[] = []
    win.addEventListener(OPEN_DRAWER_EVENT, (e) => seen.push((e as CustomEvent).detail))
    const trigger = { id: 'bouton-menu' } as unknown as HTMLElement
    openDrawer(trigger)
    openDrawer()
    expect(OPEN_DRAWER_EVENT).toBe('swatter:open-drawer')
    expect(seen).toEqual([{ trigger }, { trigger: undefined }])
  })

  it('onDrawerState suit l’ouverture et la fermeture (aria-expanded), puis se désabonne', () => {
    const states: boolean[] = []
    const off = onDrawerState((open) => states.push(open))
    win.dispatchEvent(new CustomEvent(DRAWER_STATE_EVENT, { detail: { open: true } }))
    win.dispatchEvent(new CustomEvent(DRAWER_STATE_EVENT, { detail: { open: false } }))
    // événement sans détail : considéré comme fermé
    win.dispatchEvent(new Event(DRAWER_STATE_EVENT))
    off()
    win.dispatchEvent(new CustomEvent(DRAWER_STATE_EVENT, { detail: { open: true } }))
    expect(DRAWER_STATE_EVENT).toBe('swatter:drawer')
    expect(states).toEqual([true, false, false])
  })
})
