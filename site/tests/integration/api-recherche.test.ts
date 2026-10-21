// Tests d'intégration de la recherche instantanée (GET /api/search?q=) : résultats par type de contenu, contenus publics
// seulement, requête trop courte, « webcams », accents, casse et apostrophes, caractères spéciaux sans effet de joker.
import { beforeAll, describe, expect, it } from 'vitest'
import type { SearchHit } from '@/lib/search'
import type { Article, Event, Program, Replay, Video, Webcam } from '@/payload-types'
import { apiJson } from './helpers'
import { createArticle, createEvent, createProgram, createReplay, createVideo, createWebcam, minutesFromNow, unpublish } from './api-outils'

/** Mot inventé (lettres seulement) : ne désigne que les contenus de ce fichier. */
const word = () => `zq${Array.from({ length: 7 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`
const TAG = word()
const RANK = word()
const MANY = word()

let video: Video
let replay: Replay
let article: Article
let event: Event
let program: Program
let lake: Webcam
let pass: Webcam
const hiddenTitles: string[] = []

beforeAll(async () => {
  ;[video, replay, article, event, program, lake, pass] = await Promise.all([
    createVideo({ title: `Balade ${TAG} au Semnoz` }),
    createReplay({ title: `Le journal ${TAG} du soir` }),
    createArticle({ title: `Info ${TAG} : la route du col rouverte`, department: 'savoie' }),
    createEvent({ title: `Fête ${TAG} de la châtaigne` }),
    createProgram({ title: `Magazine ${TAG}` }),
    // ordre d'affichage en tête : « webcams » seul en donne 8 au plus
    createWebcam({ name: `Lac ${TAG}`, place: 'Port d’Annecy', order: -1001 }),
    createWebcam({ name: `Col ${TAG}`, place: 'Chamonix-Mont-Blanc', order: -1000 }),
  ])
  // jamais visibles du public
  const retired = await createArticle({ title: `Article retiré ${TAG}` })
  await unpublish('articles', retired.id)
  const hidden = await Promise.all([
    createVideo({ title: `Vidéo brouillon ${TAG}` }, { draft: true }),
    createVideo({ title: `Vidéo programmée ${TAG}`, publishedAt: minutesFromNow(24 * 60) }),
    createReplay({ title: `Replay à venir ${TAG}`, broadcastAt: minutesFromNow(60) }),
    createProgram({ title: `Émission brouillon ${TAG}` }, { draft: true }),
    createEvent({ title: `Événement brouillon ${TAG}` }, { draft: true }),
    createWebcam({ name: `Webcam éteinte ${TAG}`, place: 'Chamonix', active: false }),
    createWebcam({ name: `Webcam brouillon ${TAG}`, place: 'Chamonix' }, { draft: true }),
  ])
  hiddenTitles.push(retired.title, ...hidden.map((d) => ('title' in d ? d.title : d.name)))

  // classement : le plus ancien commence par le mot cherché, le plus récent le contient seulement
  await createArticle({ title: `${RANK} du dimanche`, publishedAt: minutesFromNow(-2 * 24 * 60) })
  await createArticle({ title: `Le marché ${RANK}`, publishedAt: minutesFromNow(-10) })
  await Promise.all(Array.from({ length: 10 }, (_, i) => createArticle({ title: `${MANY} numéro ${i + 1}` })))
})

const search = (q?: string) => apiJson<{ hits: SearchHit[] }>(q === undefined ? '/search' : `/search?q=${encodeURIComponent(q)}`)
const titles = (hits: SearchHit[]) => hits.map((h) => h.title)

describe('recherche', () => {
  it('recherche : un mot trouve chaque type de contenu publié, avec son libellé et son adresse', async () => {
    const res = await search(TAG)
    expect(res.status).toBe(200)
    expect(res.response.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
    const hits = res.body.hits
    const expected = [
      { type: 'video', typeLabel: 'Vidéo', title: video.title, href: `/videos/${video.slug}` },
      { type: 'replay', typeLabel: 'Replay', title: replay.title, href: `/replay/${replay.slug}` },
      { type: 'article', typeLabel: 'Info', title: article.title, href: `/info/savoie/${article.slug}` },
      { type: 'event', typeLabel: 'Agenda', title: event.title, href: `/agenda/${event.slug}` },
      { type: 'program', typeLabel: 'Émission', title: program.title, href: `/programme-tv#${program.slug}` },
      { type: 'webcam', typeLabel: 'Webcam', title: lake.name, href: `/webcams#${lake.slug}` },
      { type: 'webcam', typeLabel: 'Webcam', title: pass.name, href: `/webcams#${pass.slug}` },
    ]
    expect(hits).toHaveLength(expected.length)
    for (const hit of expected) expect(hits).toContainEqual(expect.objectContaining(hit))
    for (const hit of hits) {
      expect(typeof hit.subtitle).toBe('string')
      expect(hit).toHaveProperty('image')
    }
  })

  it('recherche : brouillons, contenus programmés ou retirés du site, webcams inactives n’apparaissent jamais', async () => {
    expect(hiddenTitles).toHaveLength(8)
    const found = titles((await search(TAG)).body.hits)
    for (const title of hiddenTitles) expect(found, title).not.toContain(title)
    for (const title of hiddenTitles) {
      expect(titles((await search(title)).body.hits), title).not.toContain(title)
    }
  })

  it('recherche : une requête de moins de 2 caractères (ou sans lettre ni chiffre) ne renvoie rien', async () => {
    for (const q of [undefined, '', 'a', ' a ', '     ', '%%', '__', '…', '"" ']) {
      const res = await search(q)
      expect(res.status, JSON.stringify(q)).toBe(200)
      expect(res.body, JSON.stringify(q)).toEqual({ hits: [] })
    }
  })

  it('recherche : insensible aux accents et à la casse ; apostrophes droites ou typographiques équivalentes', async () => {
    for (const q of [`${TAG} fete chataigne`, `${TAG} FÊTE CHÂTAIGNE`, `${TAG.toUpperCase()} Fête`, `fête ${TAG}`]) {
      expect(titles((await search(q)).body.hits), q).toEqual([event.title])
    }
    for (const q of [`${TAG} port d'annecy`, `${TAG} Port d’Annecy`, `${TAG} PORT D'ANNECY`]) {
      expect(titles((await search(q)).body.hits), q).toEqual([lake.name])
    }
  })

  it('recherche : « webcams » seul donne les webcams actives ; « webcam » + un lieu, la webcam de ce lieu', async () => {
    for (const q of ['webcams', 'les webcams', 'Webcams']) {
      const hits = (await search(q)).body.hits
      expect(
        hits.every((h) => h.type === 'webcam'),
        q,
      ).toBe(true)
      // dans l'ordre d'affichage de la page Webcams
      expect(titles(hits).slice(0, 2), q).toEqual([lake.name, pass.name])
      for (const title of hiddenTitles) expect(titles(hits), q).not.toContain(title)
    }
    for (const q of [`webcam ${TAG} chamonix`, `caméra ${TAG} Chamonix`, `la webcam ${TAG} de chamonix`]) {
      const hits = (await search(q)).body.hits
      expect(
        hits.map((h) => [h.type, h.title]),
        q,
      ).toEqual([['webcam', pass.name]])
    }
  })

  it('recherche : un titre qui commence par la requête passe avant un titre plus récent qui la contient', async () => {
    const hits = (await search(RANK)).body.hits
    expect(titles(hits)).toEqual([`${RANK} du dimanche`, `Le marché ${RANK}`])
  })

  it('recherche : 8 résultats au plus', async () => {
    const hits = (await search(MANY)).body.hits
    expect(hits).toHaveLength(8)
    for (const hit of hits) expect(hit.title.startsWith(MANY)).toBe(true)
  })

  it('recherche : % et _ ne servent pas de joker ; une requête très longue est tronquée sans erreur', async () => {
    for (const q of [`${TAG.slice(0, 4)}_${TAG.slice(5)}`, `${TAG.slice(0, 4)}%${TAG.slice(6)}`, `${TAG.slice(0, 2)}%%${TAG.slice(-2)}`]) {
      const res = await search(q)
      expect(res.status, q).toBe(200)
      expect(res.body, q).toEqual({ hits: [] })
    }
    // ponctuation autour du mot : ignorée
    expect(titles((await search(`« ${TAG} » !`)).body.hits)).toContain(video.title)
    const long = await search(`${TAG} ${'x'.repeat(300)}`)
    expect(long.status).toBe(200)
    expect(long.body).toEqual({ hits: [] })
  })
})
