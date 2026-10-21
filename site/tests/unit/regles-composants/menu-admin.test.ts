// Menu de l'administration (src/components/admin/menu.ts) : sections et ordre calqués sur le menu du site, sous-rubriques,
// section « Administration » réservée aux administrateurs, lien de la grille ouvert sur la semaine TV en cours.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MENU, scheduleSearch, type MenuItem } from '@/components/admin/menu'
import { MAIN_NAV } from '@/components/layout/nav'
import { DRAFT_COLLECTIONS } from '@/lib/publication'
import { hiddenForEditors } from '@/access'
import { Members } from '@/collections/Members'
import { Users } from '@/collections/Users'

afterEach(() => {
  vi.useRealTimers()
})

const section = (title: string) => {
  const found = MENU.find((s) => s.title === title)
  if (!found) throw new Error(`section absente : ${title}`)
  return found
}
const labels = (items: MenuItem[]) => items.map((i) => i.label)
/** Rubriques visibles selon le rôle (même filtre que NavLinks.tsx). */
const visibleFor = (role: string) => MENU.filter((s) => !s.adminOnly || role === 'admin')

describe('sections du menu', () => {
  it('trois sections, dans l’ordre : rubriques du site, Également, Administration', () => {
    expect(MENU.map((s) => s.title)).toEqual(['Les rubriques du site', 'Également', 'Administration'])
  })

  it('les rubriques du site suivent l’ordre du menu du site (accueil et direct réunis en tête)', () => {
    const main = section('Les rubriques du site').items.filter((i) => !i.sub)
    expect(labels(main)).toEqual(['Accueil et direct', 'Vidéos', 'L’Info', 'La Météo', 'Programme TV', 'Agenda', 'Webcams', 'Le Replay'])
    // mêmes libellés que l'en-tête du site, dans le même ordre
    const site = MAIN_NAV.map((i) => i.label).filter((l) => l !== 'Accueil' && l !== 'Le Direct')
    expect(labels(main.slice(1))).toEqual(site)
  })

  it('sous-rubriques juste sous leur rubrique : Chaîne YouTube sous Vidéos, Émissions sous Programme TV', () => {
    const items = section('Les rubriques du site').items
    const under = (label: string) => items[items.findIndex((i) => i.label === label) - 1]?.label
    expect(items.filter((i) => i.sub).map((i) => i.label)).toEqual(['Chaîne YouTube', 'Émissions'])
    expect(under('Chaîne YouTube')).toBe('Vidéos')
    expect(under('Émissions')).toBe('Programme TV')
    for (const s of MENU) expect(s.items[0]?.sub).toBeFalsy()
  })

  it('Également : publicités, pages du pied de page, messages reçus et médiathèque', () => {
    expect(labels(section('Également').items)).toEqual(['Publicités', 'Pages (pied de page)', 'Messages reçus', 'Médiathèque'])
    expect(section('Également').adminOnly).toBeFalsy()
    expect(section('Les rubriques du site').adminOnly).toBeFalsy()
  })

  it('chaque lien mène à une collection ou à un global, sans doublon', () => {
    const paths = MENU.flatMap((s) => s.items.map((i) => i.path))
    for (const p of paths) expect(p).toMatch(/^\/(collections|globals)\/[a-z-]+$/)
    expect(new Set(paths).size).toBe(paths.length)
    expect(new Set(MENU.flatMap((s) => s.items.map((i) => i.label))).size).toBe(paths.length)
  })

  it('toutes les collections du site (contenus à brouillons) sont dans le menu, le menu automatique étant vidé', () => {
    const paths = new Set(MENU.flatMap((s) => s.items.map((i) => i.path)))
    for (const slug of DRAFT_COLLECTIONS) expect(paths.has(`/collections/${slug}`), slug).toBe(true)
    for (const global of ['settings', 'youtube', 'meteo']) expect(paths.has(`/globals/${global}`), global).toBe(true)
    for (const slug of ['messages', 'media', 'members', 'users', 'redirects']) expect(paths.has(`/collections/${slug}`), slug).toBe(true)
  })
})

describe('section « Administration » réservée aux administrateurs', () => {
  it('membres du site, comptes de l’équipe et redirections, marqués adminOnly', () => {
    const admin = section('Administration')
    expect(admin.adminOnly).toBe(true)
    expect(admin.items.map((i) => [i.label, i.path])).toEqual([
      ['Membres du site', '/collections/members'],
      ['Utilisateurs', '/collections/users'],
      ['Redirections', '/collections/redirects'],
    ])
  })

  it('un éditeur ne voit pas la section ; un administrateur voit tout', () => {
    expect(visibleFor('editeur').map((s) => s.title)).toEqual(['Les rubriques du site', 'Également'])
    expect(visibleFor('admin').map((s) => s.title)).toEqual(['Les rubriques du site', 'Également', 'Administration'])
    const editorPaths = visibleFor('editeur').flatMap((s) => s.items.map((i) => i.path))
    for (const p of ['/collections/members', '/collections/users', '/collections/redirects']) expect(editorPaths).not.toContain(p)
  })

  it('les collections de la section restent masquées aux éditeurs dans Payload (admin.hidden)', () => {
    expect(Members.admin?.hidden).toBe(hiddenForEditors)
    expect(Users.admin?.hidden).toBe(hiddenForEditors)
  })
})

describe('lien de la grille des programmes : semaine TV en cours', () => {
  const search = (instant: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(instant))
    return Object.fromEntries(new URLSearchParams(scheduleSearch()))
  }
  const FROM = 'where[or][0][and][0][startsAt][greater_than_equal]'
  const TO = 'where[or][0][and][1][startsAt][less_than]'

  it('seule la grille a des paramètres calculés à l’affichage', () => {
    const withSearch = MENU.flatMap((s) => s.items).filter((i) => i.search)
    expect(withSearch.map((i) => i.path)).toEqual(['/collections/schedule'])
    expect(withSearch[0].search).toBe(scheduleSearch)
  })

  it('du lundi 2 h au lundi suivant 2 h (heure de Paris), changement d’heure compris', () => {
    // mercredi 21 octobre 2026 : semaine du lundi 19 ; le dimanche 25, passage à l'heure d'hiver
    expect(search('2026-10-21T10:00:00.000Z')).toEqual({ [FROM]: '2026-10-19T00:00:00.000Z', [TO]: '2026-10-26T01:00:00.000Z' })
    expect(scheduleSearch().startsWith('?')).toBe(true)
  })

  it('la nuit jusqu’à 2 h appartient à la veille : lundi 1 h 30, c’est encore la semaine précédente', () => {
    // lundi 26 octobre 2026, 1 h 30 à Paris (0 h 30 UTC)
    expect(search('2026-10-26T00:30:00.000Z')).toEqual({ [FROM]: '2026-10-19T00:00:00.000Z', [TO]: '2026-10-26T01:00:00.000Z' })
    // lundi 26 octobre 2026, 2 h à Paris : nouvelle semaine
    expect(search('2026-10-26T01:00:00.000Z')).toEqual({ [FROM]: '2026-10-26T01:00:00.000Z', [TO]: '2026-11-02T01:00:00.000Z' })
  })

  it('dimanche soir : toujours la semaine en cours', () => {
    expect(search('2026-10-25T21:00:00.000Z')[FROM]).toBe('2026-10-19T00:00:00.000Z')
  })
})
