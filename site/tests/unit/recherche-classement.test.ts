// Tests unitaires de la recherche (src/lib/search.ts), sans base : motifs LIKE de la requête (accents, casse,
// caractères spéciaux), découpage en mots, classement (titre qui commence par la requête … autres champs, puis
// événements à venir, émissions et webcams, contenus récents), mots « webcam(s) », contenus non publiés écartés et
// lignes de résultat. Un faux Payload en mémoire applique les filtres envoyés (ILIKE de PostgreSQL : %mot%, « _ »
// pour un caractère, « \ » d’échappement, sans casse mais avec les accents).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload, Where } from 'payload'
import { atWordStart, buildTerms, likeExact, likeFuzzy, search, tierOf, type SearchHit } from '@/lib/search'

type Doc = Record<string, unknown> & { id: number }
type Db = Partial<Record<'videos' | 'replays' | 'articles' | 'events' | 'programs' | 'webcams', Doc[]>>
type FindArgs = { collection: keyof Db; where?: Where; sort?: string; limit?: number }

const NOW = new Date('2026-10-21T10:00:00Z') // mercredi 21 octobre, midi à Paris

/** Motif LIKE → expression régulière (insensible à la casse, sensible aux accents, comme ILIKE). */
function likeRegExp(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\') re += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (ch === '_') re += '.'
    else if (ch === '%') re += '.*'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(re, 'iu')
}

function matches(doc: Doc, where?: Where): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => {
    if (key === 'and') return (value as Where[]).every((w) => matches(doc, w))
    if (key === 'or') return (value as Where[]).some((w) => matches(doc, w))
    const field = doc[key]
    return Object.entries(value as Record<string, unknown>).every(([op, arg]) => {
      const time = typeof field === 'string' ? Date.parse(field) : Number.NaN
      switch (op) {
        // Payload : chaque mot séparé par une espace doit figurer (ILIKE '%mot%')
        case 'like':
          return (arg as string).split(' ').every((w) => typeof field === 'string' && likeRegExp(`%${w}%`).test(field))
        case 'equals':
          return field === arg
        case 'exists':
          return arg ? field !== undefined && field !== null : field === undefined || field === null
        case 'less_than_equal':
          return time <= Date.parse(arg as string)
        case 'less_than':
          return time < Date.parse(arg as string)
        case 'greater_than_equal':
          return time >= Date.parse(arg as string)
        default:
          throw new Error(`opérateur non géré par le faux Payload : ${op}`)
      }
    })
  })
}

function sortDocs(docs: Doc[], sort?: string): Doc[] {
  if (!sort) return docs
  const desc = sort.startsWith('-')
  const key = sort.replace(/^-/, '')
  return [...docs].sort((a, b) => {
    const x = a[key] as string | number
    const y = b[key] as string | number
    return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1)
  })
}

/** Faux Payload : `find` filtre, trie et limite les documents de la collection ; chaque appel est noté. */
function fakePayload(db: Db, failing: string[] = []) {
  const calls: FindArgs[] = []
  const find = vi.fn(async (args: FindArgs) => {
    calls.push(args)
    if (failing.includes(args.collection)) throw new Error(`collection ${args.collection} en panne`)
    const docs = sortDocs(
      (db[args.collection] ?? []).filter((d) => matches(d, args.where)),
      args.sort,
    )
    return { docs: docs.slice(0, args.limit ?? docs.length) }
  })
  return { payload: { find } as unknown as Payload, calls, find }
}

const media = (name: string) => ({ id: 1, url: `/api/media/file/${name}.webp`, sizes: { thumb: { url: `/api/media/file/${name}-thumb.webp` } } })
const label = (hits: SearchHit[]) => hits.map((h) => `${h.type}:${h.title}`)
const run = async (db: Db, q: string, limit?: number) => label(await search(fakePayload(db).payload, q, limit))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('motifs LIKE de la requête', () => {
  it('motif exact : caractères spéciaux de LIKE échappés, apostrophes droites ou courbes → un caractère quelconque', () => {
    expect(likeExact('100%')).toBe('100\\%')
    expect(likeExact('a_b')).toBe('a\\_b')
    expect(likeExact('c:\\x')).toBe('c:\\\\x')
    expect(likeExact("l'été")).toBe('l_été')
    expect(likeExact('l’été')).toBe('l_été')
  })

  it('motif élargi : voyelles et « c » remplacés par « _ » pour trouver les formes accentuées', () => {
    expect(likeFuzzy('meteo')).toBe('m_t__')
    expect(likeFuzzy('francais')).toBe('fr_n___s')
    expect(likeFuzzy("l'ete")).toBe('l__t_')
    expect(likeFuzzy('50%')).toBe('50\\%')
    expect(likeFuzzy('x_y')).toBe('x\\_y')
    expect(likeFuzzy('tgv')).toBe('tgv')
  })

  it('requête découpée en mots pliés (sans casse ni accents), motif exact d’après la saisie', () => {
    expect(buildTerms('  Météo   d’Annecy ')).toEqual({
      words: ['meteo', "d'annecy"],
      terms: [
        { exact: 'météo', fuzzy: 'm_t__' },
        { exact: 'd_annecy', fuzzy: 'd__nn__y' },
      ],
    })
  })

  it('mots en double ignorés, six mots au plus, requête vide sans mot', () => {
    expect(buildTerms('lac LAC Lac un deux trois quatre cinq six').words).toEqual(['lac', 'un', 'deux', 'trois', 'quatre', 'cinq'])
    expect(buildTerms('« … »')).toEqual({ terms: [], words: [] })
    expect(buildTerms('')).toEqual({ terms: [], words: [] })
  })

  it('découpages de la saisie et de la forme pliée différents : repli sur le mot plié', () => {
    // « ʼ » (lettre apostrophe) est un mot à part entière dans la saisie, mais disparaît une fois plié
    expect(buildTerms('ʼ Météo')).toEqual({ words: ['meteo'], terms: [{ exact: 'meteo', fuzzy: 'm_t__' }] })
  })
})

describe('début de mot et rang d’un titre', () => {
  it('le mot commence-t-il un mot du texte ?', () => {
    expect(atWordStart("lac d'annecy", 'lac')).toBe(true)
    expect(atWordStart("lac d'annecy", 'annecy')).toBe(true)
    expect(atWordStart('la place du lac', 'lac')).toBe(true)
    expect(atWordStart('la place', 'lac')).toBe(false)
    expect(atWordStart('titre\nlac', 'lac')).toBe(true)
    expect(atWordStart('édition 2026', '2026')).toBe(true)
    expect(atWordStart('a2026', '2026')).toBe(false)
    expect(atWordStart('', 'lac')).toBe(false)
  })

  it('0 : le titre commence par la requête … 4 : elle n’est que dans les autres champs', () => {
    const ctx = (q: string) => ({ ...buildTerms(q), phrase: buildTerms(q).words.join(' ') }) as unknown as Parameters<typeof tierOf>[1]
    expect(tierOf('Lac d’Annecy', ctx('lac'))).toBe(0)
    expect(tierOf('MÉTÉO DES NEIGES', ctx('meteo'))).toBe(0)
    expect(tierOf('Le lac d’Annecy', ctx('lac'))).toBe(1)
    expect(tierOf('Balade sur la place', ctx('lac'))).toBe(2)
    expect(tierOf('Annecy, le lac', ctx('lac annecy'))).toBe(3)
    expect(tierOf('Le journal', ctx('lac'))).toBe(4)
  })
})

describe('search : requête', () => {
  const db: Db = {
    videos: [
      { id: 1, title: 'Météo des neiges à Chamonix', slug: 'meteo-neiges', category: 'nature', publishedAt: '2026-10-20T08:00:00Z', description: '' },
      { id: 2, title: 'Le matin des Alpes', slug: 'matin', category: 'magazine', publishedAt: '2026-10-19T08:00:00Z', description: '' },
      { id: 3, title: 'Variable x_y du jour', slug: 'x-y', category: 'info', publishedAt: '2026-10-19T08:00:00Z', description: '' },
      { id: 4, title: 'Variable xay du jour', slug: 'xay', category: 'info', publishedAt: '2026-10-18T08:00:00Z', description: '' },
    ],
  }

  it('vide, blanche ou sans lettre ni chiffre : aucun résultat, sans interroger la base', async () => {
    const { payload, find } = fakePayload(db)
    for (const q of ['', '   ', '« ! »', '%', '_', '…']) expect(await search(payload, q), JSON.stringify(q)).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })

  it('sans tenir compte de la casse ni des accents', async () => {
    for (const q of ['meteo', 'METEO', 'Météo', 'météo', 'MÉTÉO']) expect(await run(db, q), q).toEqual(['video:Météo des neiges à Chamonix'])
  })

  it('requête élargie aux accents seulement quand elle sert : pas pour une saisie accentuée ni un mot sans voyelle', async () => {
    const count = async (q: string) => {
      const { payload, calls } = fakePayload(db)
      await search(payload, q)
      return calls.filter((c) => c.collection === 'videos').length
    }
    expect(await count('meteo')).toBe(2)
    expect(await count('météo')).toBe(1)
    expect(await count('tgv')).toBe(1)
  })

  it('correspondances approximatives de la requête élargie écartées (« m_t__ » trouve « matin »)', async () => {
    expect(await run(db, 'meteo')).not.toContain('video:Le matin des Alpes')
  })

  it('caractères spéciaux de LIKE cherchés tels quels (« _ » n’est pas un joker)', async () => {
    const { payload, calls } = fakePayload(db)
    expect(label(await search(payload, 'x_y'))).toEqual(['video:Variable x_y du jour'])
    expect(JSON.stringify(calls[0].where)).toContain('"like":"x\\\\_y"')
    // « % » en fin de mot est une ponctuation, retirée de la requête
    expect(buildTerms('100%').words).toEqual(['100'])
  })

  it('chaque mot doit figurer dans l’un des champs', async () => {
    const { payload, calls } = fakePayload(db)
    await search(payload, 'neiges chamonix')
    const where = calls.find((c) => c.collection === 'videos')?.where as { and: [{ and: Where[] }] }
    expect(where.and[0]).toEqual({
      and: [
        { or: [{ title: { like: 'neiges' } }, { description: { like: 'neiges' } }] },
        { or: [{ title: { like: 'chamonix' } }, { description: { like: 'chamonix' } }] },
      ],
    })
    expect(await run(db, 'neiges chamonix')).toEqual(['video:Météo des neiges à Chamonix'])
    expect(await run(db, 'neiges lyon')).toEqual([])
  })

  it('nombre de résultats : 8 par défaut, de 1 à 100, et assez de candidats demandés à chaque rubrique', async () => {
    const many: Db = {
      videos: Array.from({ length: 200 }, (_, i) => ({
        id: i + 1,
        title: `Lac n° ${i + 1}`,
        slug: `lac-${i + 1}`,
        category: 'nature',
        publishedAt: new Date(NOW.getTime() - (i + 1) * 3600_000).toISOString(),
        description: '',
      })),
    }
    const limits = async (limit?: number) => {
      const { payload, calls } = fakePayload(many)
      const hits = await search(payload, 'lac', limit)
      return { count: hits.length, take: calls.find((c) => c.collection === 'videos')?.limit }
    }
    expect(await limits()).toEqual({ count: 8, take: 24 })
    expect(await limits(3)).toEqual({ count: 3, take: 24 })
    expect(await limits(60)).toEqual({ count: 60, take: 150 })
    expect(await limits(500)).toEqual({ count: 100, take: 150 })
    expect(await limits(0)).toEqual({ count: 8, take: 24 })
    expect(await limits(-5)).toEqual({ count: 1, take: 24 })
    expect(await limits(Number.NaN)).toEqual({ count: 8, take: 24 })
  })

  it('une rubrique en panne n’empêche pas les autres de répondre', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const both: Db = { ...db, programs: [{ id: 9, title: 'Météo du soir', slug: 'meteo-soir', genre: 'meteo', synopsis: '' }] }
    const { payload } = fakePayload(both, ['videos'])
    expect(label(await search(payload, 'meteo'))).toEqual(['program:Météo du soir'])
    expect(console.error).toHaveBeenCalled()
  })
})

describe('search : contenus visibles', () => {
  it('vidéos et articles programmés, replays pas encore diffusés et webcams désactivées écartés', async () => {
    const db: Db = {
      videos: [
        { id: 1, title: 'Lac en ligne', slug: 'a', publishedAt: '2026-10-20T08:00:00Z' },
        { id: 2, title: 'Lac programmé', slug: 'b', publishedAt: '2026-10-22T08:00:00Z' },
      ],
      replays: [
        { id: 3, title: 'Lac diffusé', slug: 'c', broadcastAt: '2026-10-21T09:59:00Z' },
        { id: 4, title: 'Lac à venir', slug: 'd', broadcastAt: '2026-10-21T20:00:00Z' },
      ],
      articles: [
        { id: 5, title: 'Lac publié', slug: 'e', department: 'savoie', publishedAt: '2026-10-21T10:00:00Z' },
        { id: 6, title: 'Lac demain', slug: 'f', department: 'savoie', publishedAt: '2026-10-22T06:00:00Z' },
      ],
      webcams: [
        { id: 7, name: 'Lac actif', slug: 'g', active: true, order: 1 },
        { id: 8, name: 'Lac en panne', slug: 'h', active: false, order: 2 },
        { id: 9, name: 'Lac sans réglage', slug: 'i', order: 3 },
      ],
    }
    const titles = await run(db, 'lac', 50)
    expect(titles.sort()).toEqual(['article:Lac publié', 'replay:Lac diffusé', 'video:Lac en ligne', 'webcam:Lac actif', 'webcam:Lac sans réglage'])
  })
})

describe('search : classement', () => {
  const db: Db = {
    videos: [
      { id: 1, title: 'Lac bleu', slug: 'lac-bleu', category: 'nature', publishedAt: '2026-10-20T08:00:00Z', description: '' },
      { id: 2, title: 'Balade sur la place', slug: 'place', category: 'nature', publishedAt: '2026-10-21T08:00:00Z', description: 'Vue sur le lac.' },
      { id: 3, title: 'Lac noir', slug: 'lac-noir', category: 'nature', publishedAt: '2026-09-01T08:00:00Z', description: '' },
    ],
    replays: [
      {
        id: 10,
        title: 'Le journal des Alpes',
        slug: 'journal',
        broadcastAt: '2026-10-21T06:00:00Z',
        description: 'Reportage au bord du lac.',
        program: { id: 1, title: 'Le journal' },
      },
    ],
    articles: [
      {
        id: 20,
        title: 'Un ponton sur le lac',
        slug: 'ponton',
        department: 'haute-savoie',
        city: 'Annecy',
        kicker: 'Société',
        excerpt: '',
        publishedAt: '2026-10-21T07:00:00Z',
      },
    ],
    events: [
      { id: 30, title: 'Lac en fête', slug: 'lac-en-fete', startDate: '2026-11-07T18:00:00Z', city: 'Annecy', place: 'Pâquier', description: '' },
      { id: 31, title: 'Fête du lac', slug: 'fete-du-lac', startDate: '2026-10-30T18:00:00Z', city: 'Annecy', place: '', description: '' },
      { id: 32, title: 'Lac gelé (2025)', slug: 'lac-gele', startDate: '2025-01-10T18:00:00Z', city: 'Annecy', place: '', description: '' },
      { id: 33, title: 'Lac en musique', slug: 'lac-musique', startDate: '2026-10-24T18:00:00Z', city: 'Annecy', place: '', description: '' },
    ],
    programs: [{ id: 40, title: 'Lac et montagnes', slug: 'lac-et-montagnes', genre: 'documentaire', synopsis: '' }],
    webcams: [
      { id: 50, name: 'Lac d’Annecy', slug: 'annecy', place: 'Port d’Annecy', active: true, order: 1 },
      { id: 51, name: 'Chamonix', slug: 'chamonix', place: 'Aiguille du Midi', active: true, order: 2 },
    ],
  }

  it('rang du titre, puis : événements à venir (les plus proches d’abord), émissions et webcams, contenus récents, événements passés', async () => {
    expect(await run(db, 'lac', 20)).toEqual([
      'event:Lac en musique',
      'event:Lac en fête',
      'program:Lac et montagnes',
      'webcam:Lac d’Annecy',
      'video:Lac bleu',
      'video:Lac noir',
      'event:Lac gelé (2025)',
      'event:Fête du lac',
      'article:Un ponton sur le lac',
      'video:Balade sur la place',
      'replay:Le journal des Alpes',
    ])
  })

  it('début de mot exigé s’il y a de telles correspondances (« lac » ne trouve pas « place » seul)', async () => {
    const titles = await run(
      { videos: [{ id: 1, title: 'La place du marché', slug: 'p', publishedAt: '2026-10-20T08:00:00Z' }, ...(db.videos ?? [])] },
      'lac',
      20,
    )
    expect(titles).not.toContain('video:La place du marché')
  })

  it('sinon, repli sur les correspondances au milieu d’un mot (« nnecy »)', async () => {
    // la webcam a « nnecy » dans son nom (rang 2), les autres dans leur commune seulement (rang 4)
    expect(await run(db, 'nnecy', 20)).toEqual([
      'webcam:Lac d’Annecy',
      'event:Lac en musique',
      'event:Fête du lac',
      'event:Lac en fête',
      'article:Un ponton sur le lac',
      'event:Lac gelé (2025)',
    ])
  })

  it('plusieurs mots : tous les mots dans le titre passent avant les autres champs, même des événements à venir', async () => {
    expect(await run(db, 'annecy lac', 20)).toEqual([
      'webcam:Lac d’Annecy',
      'event:Lac en musique',
      'event:Fête du lac',
      'event:Lac en fête',
      'article:Un ponton sur le lac',
      'event:Lac gelé (2025)',
    ])
  })
})

describe('search : mots « webcam(s) »', () => {
  const db: Db = {
    webcams: [
      { id: 1, name: 'Lac d’Annecy', slug: 'annecy', place: 'Port d’Annecy', active: true, order: 2, image: media('annecy') },
      { id: 2, name: 'Chamonix', slug: 'chamonix', place: 'Aiguille du Midi', active: true, order: 1 },
      { id: 3, name: 'Col en panne', slug: 'col', place: 'Col', active: false, order: 3 },
      { id: 4, name: 'Grand-Bornand', slug: 'bornand', place: '', active: true, order: 4 },
    ],
    videos: [
      {
        id: 10,
        title: 'Webcams : les plus belles images de l’hiver',
        slug: 'webcams-hiver',
        category: 'nature',
        publishedAt: '2026-10-20T08:00:00Z',
        description: '',
      },
    ],
    programs: [{ id: 20, title: 'Le lac', slug: 'le-lac', genre: 'magazine', synopsis: '' }],
  }

  it('« webcams » seul : toutes les webcams actives, dans l’ordre de la page Webcams, en tête', async () => {
    expect(await run(db, 'webcams', 20)).toEqual([
      'webcam:Chamonix',
      'webcam:Lac d’Annecy',
      'webcam:Grand-Bornand',
      'video:Webcams : les plus belles images de l’hiver',
    ])
    for (const q of ['webcam', 'Webcam', 'cam', 'cams', 'caméra', 'CAMÉRAS', 'les webcams', 'voir les webcams']) {
      expect(
        (await run(db, q, 20)).filter((t) => t.startsWith('webcam:')),
        q,
      ).toEqual(['webcam:Chamonix', 'webcam:Lac d’Annecy', 'webcam:Grand-Bornand'])
    }
  })

  it('« webcam » et un lieu : le mot « webcam » (et les petits mots autour) est retiré de la recherche des webcams', async () => {
    expect(await run(db, 'webcam annecy', 20)).toEqual(['webcam:Lac d’Annecy'])
    expect(await run(db, 'la webcam du lac', 20)).toEqual(['webcam:Lac d’Annecy'])
    expect(await run(db, 'caméra Chamonix', 20)).toEqual(['webcam:Chamonix'])
    const { payload, calls } = fakePayload(db)
    await search(payload, 'webcam annecy')
    const webcamWhere = JSON.stringify(calls.find((c) => c.collection === 'webcams')?.where)
    expect(webcamWhere).toContain('annecy')
    expect(webcamWhere).not.toContain('webcam')
  })

  it('les autres rubriques cherchent toujours tous les mots', async () => {
    // l'émission « Le lac » ne contient pas « webcam »
    expect(await run(db, 'webcam lac', 20)).not.toContain('program:Le lac')
  })

  it('ligne de résultat d’une webcam : son lieu (à défaut « Webcam en images »), lien vers sa vignette, image', async () => {
    const hits = await search(fakePayload(db).payload, 'webcams', 20)
    expect(hits.find((h) => h.title === 'Lac d’Annecy')).toEqual({
      type: 'webcam',
      typeLabel: 'Webcam',
      title: 'Lac d’Annecy',
      subtitle: 'Port d’Annecy',
      href: '/webcams#annecy',
      image: '/api/media/file/annecy-thumb.webp',
    })
    expect(hits.find((h) => h.title === 'Grand-Bornand')).toMatchObject({ subtitle: 'Webcam en images', image: null })
  })
})

describe('search : lignes de résultat des autres rubriques', () => {
  it('vidéo : catégorie, date et durée ; lien et vignette', async () => {
    const db: Db = {
      videos: [
        {
          id: 1,
          title: 'Balade au Semnoz',
          slug: 'balade-au-semnoz',
          category: 'nature',
          duration: '04:05',
          publishedAt: '2026-10-20T08:00:00Z',
          thumbnail: media('semnoz'),
        },
      ],
    }
    expect(await search(fakePayload(db).payload, 'semnoz')).toEqual([
      {
        type: 'video',
        typeLabel: 'Vidéo',
        title: 'Balade au Semnoz',
        subtitle: 'Nature · 20 octobre 2026 · 04:05',
        href: '/videos/balade-au-semnoz',
        image: '/api/media/file/semnoz-thumb.webp',
      },
    ])
  })

  it('replay : émission, date de diffusion et durée', async () => {
    const db: Db = {
      replays: [
        {
          id: 1,
          title: 'Le journal du 19 octobre',
          slug: 'journal-19',
          broadcastAt: '2026-10-19T17:00:00Z',
          duration: '26 min',
          program: { id: 3, title: 'Le journal' },
        },
      ],
    }
    expect(await search(fakePayload(db).payload, 'journal')).toEqual([
      {
        type: 'replay',
        typeLabel: 'Replay',
        title: 'Le journal du 19 octobre',
        subtitle: 'Le journal · 19 octobre 2026 · 26 min',
        href: '/replay/journal-19',
        image: null,
      },
    ])
  })

  it('article : commune, à défaut département (ou la région) ; lien dans son département', async () => {
    const db: Db = {
      articles: [
        {
          id: 1,
          title: 'Ponton à Annecy',
          slug: 'ponton',
          department: 'haute-savoie',
          city: 'Annecy',
          publishedAt: '2026-10-21T07:00:00Z',
          image: media('ponton'),
        },
        { id: 2, title: 'Ponton en Isère', slug: 'ponton-isere', department: 'isere', city: '', publishedAt: '2026-10-20T07:00:00Z' },
        { id: 3, title: 'Ponton régional', slug: 'ponton-region', publishedAt: '2026-10-19T07:00:00Z' },
      ],
    }
    expect(await search(fakePayload(db).payload, 'ponton')).toEqual([
      {
        type: 'article',
        typeLabel: 'Info',
        title: 'Ponton à Annecy',
        subtitle: 'Annecy · 21 octobre 2026',
        href: '/info/haute-savoie/ponton',
        image: '/api/media/file/ponton-thumb.webp',
      },
      { type: 'article', typeLabel: 'Info', title: 'Ponton en Isère', subtitle: 'Isère · 20 octobre 2026', href: '/info/isere/ponton-isere', image: null },
      {
        type: 'article',
        typeLabel: 'Info',
        title: 'Ponton régional',
        subtitle: 'Auvergne-Rhône-Alpes · 19 octobre 2026',
        href: '/info/region/ponton-region',
        image: null,
      },
    ])
  })

  it('émission : genre et « Programme TV », lien vers sa fiche dans la grille', async () => {
    const db: Db = { programs: [{ id: 1, title: 'Lac et montagnes', slug: 'lac-et-montagnes', genre: 'documentaire', synopsis: '', image: media('lac') }] }
    expect(await search(fakePayload(db).payload, 'montagnes')).toEqual([
      {
        type: 'program',
        typeLabel: 'Émission',
        title: 'Lac et montagnes',
        subtitle: 'Documentaire · Programme TV',
        href: '/programme-tv#lac-et-montagnes',
        image: '/api/media/file/lac-thumb.webp',
      },
    ])
  })

  it('événement : « Aujourd’hui », jour à venir, « Jusqu’au … » s’il a commencé, date s’il est passé ; puis la commune', async () => {
    const db: Db = {
      events: [
        { id: 1, title: 'Marché ce soir', slug: 'a', startDate: '2026-10-21T16:00:00Z', city: 'Annecy' },
        { id: 2, title: 'Marché depuis ce matin', slug: 'b', startDate: '2026-10-21T06:00:00Z', city: 'Thônes' },
        { id: 3, title: 'Marché toute la semaine', slug: 'c', startDate: '2026-10-19T08:00:00Z', endDate: '2026-10-25T20:00:00Z', city: 'Lyon' },
        { id: 4, title: 'Marché de vendredi', slug: 'd', startDate: '2026-10-30T19:00:00Z', city: 'Cluses' },
        { id: 5, title: 'Marché fini hier', slug: 'e', startDate: '2026-10-18T08:00:00Z', endDate: '2026-10-20T20:00:00Z', city: 'Annecy' },
        { id: 6, title: 'Marché de l’an dernier', slug: 'f', startDate: '2025-08-01T08:00:00Z', city: 'Annecy' },
        { id: 7, title: 'Marché d’hier soir', slug: 'g', startDate: '2026-10-20T18:00:00Z', city: 'Sallanches' },
      ],
    }
    const hits = await search(fakePayload(db).payload, 'marche', 20)
    const subtitles = Object.fromEntries(hits.map((h) => [h.title, h.subtitle]))
    expect(subtitles['Marché ce soir']).toBe('Aujourd’hui · Annecy')
    expect(subtitles['Marché depuis ce matin']).toBe('Aujourd’hui · Thônes')
    expect(subtitles['Marché toute la semaine']).toBe('Jusqu’au dimanche 25 octobre · Lyon')
    expect(subtitles['Marché de vendredi']).toBe('Vendredi 30 octobre · Cluses')
    expect(subtitles['Marché fini hier']).toBe('18 octobre 2026 · Annecy')
    expect(subtitles['Marché de l’an dernier']).toBe('1er août 2025 · Annecy')
    expect(subtitles['Marché d’hier soir']).toBe('20 octobre 2026 · Sallanches')
    expect(hits.find((h) => h.title === 'Marché ce soir')).toMatchObject({ type: 'event', typeLabel: 'Agenda', href: '/agenda/a' })
    // en cours ou à venir d'abord, par date de début (déjà commencé en premier), puis les passés (les plus récents en premier)
    expect(label(hits)).toEqual([
      'event:Marché toute la semaine',
      'event:Marché depuis ce matin',
      'event:Marché ce soir',
      'event:Marché de vendredi',
      'event:Marché d’hier soir',
      'event:Marché fini hier',
      'event:Marché de l’an dernier',
    ])
  })
})
