// Anciennes adresses du site : règles de next.config.ts (redirects(), simulées avec le moteur de correspondance de
// Next.js : sans casse, barre finale retirée d'abord) et table de la route attrape-tout
// (src/app/(frontend)/[...slug]/legacy.ts : casse, accents, barre finale, jamais vers elle-même ni hors du site).
import type { Redirect } from 'next/dist/lib/load-custom-routes'
import loadCustomRoutes from 'next/dist/lib/load-custom-routes'
import { getRedirectStatus } from 'next/dist/lib/redirect-status'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { beforeAll, describe, expect, it } from 'vitest'
import { foldPath, legacyTarget } from '@/app/(frontend)/[...slug]/legacy'
import nextConfig from '../../../next.config'

const SITE = 'https://www.swatter-tv.fr'

/** Anciennes adresses du site précédent (GUIDE_CLIENT.md, partie 19) et leur rubrique. */
const OLD_ADDRESSES: [string, string][] = [
  ['/Accueil', '/'],
  ['/Le-Direct', '/direct'],
  ['/LeDirect', '/direct'],
  ['/L-info', '/info'],
  ['/Linfo', '/info'],
  ['/La-Meteo', '/meteo'],
  ['/LaMeteo', '/meteo'],
  ['/ProgrammeTV', '/programme-tv'],
  ['/Le-Replay', '/replay'],
  ['/LeReplay', '/replay'],
  ['/Webcam', '/webcams'],
]

/** Adresses actuelles du site : jamais redirigées. */
const CURRENT = [
  ...['/', '/direct', '/info', '/info/savoie', '/meteo', '/meteo/isere', '/programme-tv', '/agenda', '/agenda/fete-du-lac'],
  ...['/videos', '/replay', '/webcams', '/webcams/plus', '/recherche', '/contact', '/compte', '/admin', '/api/videos'],
]

let raw: Redirect[]
let rules: (Redirect & { match: ReturnType<typeof getPathMatch> })[]

/** Suit les redirections comme le serveur de Next.js (au plus 5 sauts) : liste des adresses successives. */
function follow(pathname: string): string[] {
  const hops = [pathname]
  for (let i = 0; i < 5; i++) {
    const current = hops[hops.length - 1]
    const rule = rules.find((r) => r.match(current))
    if (!rule) break
    const params = rule.match(current) as Record<string, string | string[]>
    hops.push(prepareDestination({ appendParamsToQuery: false, destination: rule.destination, params, query: {} }).newUrl)
  }
  return hops
}

beforeAll(async () => {
  raw = ((await nextConfig.redirects?.()) ?? []) as Redirect[]
  const { redirects } = await loadCustomRoutes(nextConfig)
  // même compilation que le serveur (src: next/dist/server/lib/router-utils/filesystem.js) : caseSensitiveRoutes vaut false
  rules = redirects.map((r) => ({ ...r, match: getPathMatch(r.source, { strict: true, removeUnnamedParams: true, sensitive: false }) }))
})

describe('next.config.ts : redirections permanentes des anciennes adresses', () => {
  it('chaque ancienne adresse du site précédent a sa règle permanente (308)', () => {
    expect(raw.map((r) => [r.source, r.destination])).toEqual(expect.arrayContaining(OLD_ADDRESSES))
    for (const r of raw) {
      expect(r.permanent).toBe(true)
      expect(getRedirectStatus(r)).toBe(308)
    }
  })

  it('chaque ancienne adresse mène à sa rubrique en un seul saut', () => {
    for (const [source, destination] of OLD_ADDRESSES) expect(follow(source)).toEqual([source, destination])
  })

  it('la casse est ignorée : /l-info, /L-INFO, /le-direct, /lameteo…', () => {
    expect(follow('/l-info').at(-1)).toBe('/info')
    expect(follow('/L-INFO').at(-1)).toBe('/info')
    expect(follow('/le-direct').at(-1)).toBe('/direct')
    expect(follow('/lameteo').at(-1)).toBe('/meteo')
    expect(follow('/programmetv').at(-1)).toBe('/programme-tv')
    expect(follow('/WEBCAM').at(-1)).toBe('/webcams')
    expect(follow('/accueil').at(-1)).toBe('/')
  })

  it('la barre oblique finale est retirée avant ces règles', () => {
    expect(follow('/L-info/')).toEqual(['/L-info/', '/L-info', '/info'])
    expect(follow('/le-replay/')).toEqual(['/le-replay/', '/le-replay', '/replay'])
  })

  it('aucune boucle : une destination n’est jamais elle-même redirigée', () => {
    for (const { source, destination } of raw) {
      expect(follow(destination), destination).toEqual([destination])
      // et la règle elle-même aboutit en un seul saut
      expect(follow(source), source).toHaveLength(2)
    }
  })

  it('les adresses actuelles du site ne sont jamais redirigées', () => {
    for (const path of CURRENT) expect(follow(path), path).toEqual([path])
  })

  it('une règle ne couvre que son adresse exacte (ni préfixe ni suite)', () => {
    expect(follow('/Webcams')).toEqual(['/Webcams'])
    expect(follow('/L-information')).toEqual(['/L-information'])
    expect(follow('/LaMeteo2')).toEqual(['/LaMeteo2'])
  })

  it('les variantes de casse des rubriques (/Agenda, /Programme-TV…) sont laissées à la route attrape-tout', () => {
    for (const path of ['/Agenda', '/Programme-TV', '/Webcams', '/Videos', '/Meteo', '/Replay', '/Direct', '/Info']) {
      expect(follow(path), path).toEqual([path])
      expect(legacyTarget(path.slice(1)), path).toBe(path.toLowerCase())
    }
  })

  it('la route attrape-tout connaît les mêmes anciennes adresses (filet si la correspondance devenait sensible à la casse)', () => {
    for (const { source, destination } of raw) expect(legacyTarget(source.slice(1)), source).toBe(destination)
  })
})

describe('route attrape-tout : foldPath', () => {
  it('minuscules, sans accents, apostrophes droites, sans barre finale', () => {
    expect(foldPath('La-Météo')).toBe('la-meteo')
    expect(foldPath('LE-REPLAY/')).toBe('le-replay')
    expect(foldPath('Info/Savoie//')).toBe('info/savoie')
    expect(foldPath('L’Info')).toBe("l'info")
    expect(foldPath('Fête-des-Lumières')).toBe('fete-des-lumieres')
  })
})

describe('route attrape-tout : legacyTarget', () => {
  it('anciennes adresses, sans casse ni accents', () => {
    const cases: [string, string][] = [
      ['La-Météo', '/meteo'],
      ['LA-METEO', '/meteo'],
      ['la-météo', '/meteo'],
      ['Le-Replay', '/replay'],
      ['LE-REPLAY', '/replay'],
      ['le-replay', '/replay'],
      ['LeDirect', '/direct'],
      ['LE-DIRECT', '/direct'],
      ['L-Info', '/info'],
      ['LINFO', '/info'],
      ['Programme-TV', '/programme-tv'],
      ['PROGRAMMETV', '/programme-tv'],
      ['Webcam', '/webcams'],
      ['webcam', '/webcams'],
      ['Accueil', '/'],
      ['ACCUEIL', '/'],
    ]
    for (const [path, target] of cases) expect(legacyTarget(path), path).toBe(target)
  })

  it('barre finale ignorée', () => {
    expect(legacyTarget('La-Météo/')).toBe('/meteo')
    expect(legacyTarget('Agenda/')).toBe('/agenda')
    expect(legacyTarget('webcam//')).toBe('/webcams')
  })

  it('variantes de casse ou d’accents d’une rubrique : sa forme en minuscules, sous-pages comprises', () => {
    const cases: [string, string][] = [
      ['Agenda', '/agenda'],
      ['AGENDA', '/agenda'],
      ['Vidéos', '/videos'],
      ['Météo', '/meteo'],
      ['Recherche', '/recherche'],
      ['Programme-Tv', '/programme-tv'],
      ['Vidéos/Mon-Clip', '/videos/mon-clip'],
      ['Info/Savoie', '/info/savoie'],
      ['Meteo/Isère', '/meteo/isere'],
    ]
    for (const [path, target] of cases) expect(legacyTarget(path), path).toBe(target)
  })

  it('jamais vers l’adresse demandée elle-même (pas de boucle)', () => {
    for (const path of ['programme-tv', 'agenda', 'webcams', 'meteo/isere', 'videos/mon-clip', 'info']) expect(legacyTarget(path), path).toBeNull()
  })

  it('adresse inconnue : rien (page 404)', () => {
    for (const path of ['page-inconnue', 'Mentions-Legales', 'L-info/savoie-2019', '', 'agendas', 'webcamz']) expect(legacyTarget(path), path).toBeNull()
  })

  it('noms réservés de JavaScript (/constructor, /__proto__…) : rien, comme toute adresse inconnue', () => {
    for (const path of ['constructor', 'Constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype']) {
      const target = legacyTarget(path)
      expect(target === null || typeof target === 'string', path).toBe(true)
      expect(target, path).toBeNull()
    }
  })

  it('jamais hors du site : toujours un chemin interne', () => {
    const tricky = ['//exemple.org', 'Agenda//exemple.org', 'Agenda/\\exemple.org', 'Vidéos/../../exemple.org', 'Info/%2F%2Fexemple.org']
    tricky.push('https:/exemple.org', 'Recherche/@exemple.org')
    for (const path of tricky) {
      const target = legacyTarget(path)
      if (target === null) continue
      expect(target.startsWith('/') && !target.startsWith('//'), path).toBe(true)
      expect(new URL(target, SITE).origin, path).toBe(SITE)
    }
  })
})
