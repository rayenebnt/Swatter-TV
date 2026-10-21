// Tableau de bord de l'administration (src/components/admin/dashboard-data.ts) avec une fausse instance Payload en mémoire
// (les clauses where sont évaluées comme le ferait PostgreSQL) : ce que voient les visiteurs en ce moment, oublis
// signalés, derniers contenus modifiés, chiffres de l'espace membres, et résistance aux requêtes en échec.
import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { getDashboardData } from '@/components/admin/dashboard-data'
import { loadItems, type MemberItem } from '@/lib/members/items'
import { matches, sortDocs, type Doc } from './outils'

vi.mock('@/lib/members/items', () => ({ loadItems: vi.fn() }))

// mercredi 21 octobre 2026, 12 h à Paris
const NOW = new Date('2026-10-21T10:00:00.000Z')
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

type Store = Record<string, Doc[]>
type Args = { collection?: string; slug?: string; where?: Parameters<typeof matches>[1]; sort?: string | string[]; limit?: number; pagination?: boolean }

/** Fausse instance Payload : find / count / findGlobal sur des documents en mémoire ; `failing` simule des requêtes en échec. */
function fakePayload(store: Store, globals: Record<string, Doc> = {}, failing: string[] = []) {
  const fail = (key: string) => {
    if (failing.includes(key)) throw new Error(`panne simulée : ${key}`)
  }
  const select = (args: Args) => (store[args.collection ?? ''] ?? []).filter((d) => matches(d, args.where))
  const payload = {
    find: vi.fn(async (args: Args) => {
      fail(`find:${args.collection}`)
      const docs = sortDocs(select(args), args.sort)
      // comme Payload : 10 par défaut avec pagination, tout sans pagination ni limite
      const limit = args.limit ?? (args.pagination !== false ? 10 : 0)
      return { docs: limit ? docs.slice(0, limit) : docs, totalDocs: docs.length }
    }),
    count: vi.fn(async (args: Args) => {
      fail(`count:${args.collection}`)
      return { totalDocs: select(args).length }
    }),
    findGlobal: vi.fn(async (args: Args) => {
      fail(`global:${args.slug}`)
      return globals[args.slug ?? ''] ?? {}
    }),
  }
  return payload as unknown as Payload
}

const dashboard = (store: Store, globals: Record<string, Doc> = {}, failing: string[] = []) => getDashboardData(fakePayload(store, globals, failing))

type Ref = { kind: MemberItem['kind']; itemId: number }
/** Contenus trouvés par loadItems (titre et lien de chaque contenu de l'historique). */
const items = (refs: Ref[], title = (r: Ref) => `Contenu ${r.itemId}`) =>
  new Map(
    refs.map((r): [string, MemberItem] => {
      const item: MemberItem = { kind: r.kind, id: r.itemId, title: title(r), href: `/${r.kind}/${r.itemId}`, image: '', meta: '' }
      return [`${r.kind}:${r.itemId}`, item]
    }),
  )

let errors: MockInstance<typeof console.error>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(loadItems).mockReset()
  vi.mocked(loadItems).mockImplementation(async (_payload, refs) => items(refs))
})

afterEach(() => {
  errors.mockRestore()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('vidéo du jour et info du jour', () => {
  const video = (id: number, over: Doc) => ({ id, title: `Vidéo ${id}`, _status: 'published', isVideoOfDay: false, publishedAt: ago(DAY), ...over })

  it('la plus récente des vidéos cochées, publiée et déjà en ligne', async () => {
    const videos = [
      video(1, { isVideoOfDay: true, publishedAt: ago(10 * DAY) }),
      video(2, { isVideoOfDay: true, publishedAt: ago(2 * DAY) }),
      video(3, { publishedAt: ago(HOUR) }),
      // brouillon coché : pas sur le site
      video(4, { isVideoOfDay: true, _status: 'draft', publishedAt: ago(HOUR) }),
      // programmée : pas encore sur le site
      video(5, { isVideoOfDay: true, publishedAt: later(HOUR) }),
    ]
    expect((await dashboard({ videos })).videoOfDay).toEqual({ id: 2, title: 'Vidéo 2', picked: true })
  })

  it('aucune case cochée : la dernière vidéo publiée, signalée comme choix par défaut', async () => {
    const videos = [video(1, { publishedAt: ago(3 * DAY) }), video(2, { publishedAt: ago(HOUR) }), video(3, { publishedAt: later(DAY) })]
    expect((await dashboard({ videos })).videoOfDay).toEqual({ id: 2, title: 'Vidéo 2', picked: false })
  })

  it('aucune vidéo en ligne : rien', async () => {
    const videos = [video(1, { _status: 'draft', isVideoOfDay: true }), video(2, { publishedAt: later(DAY) })]
    expect((await dashboard({ videos })).videoOfDay).toBeNull()
  })

  it('info du jour : même règle avec les articles cochés « Info du jour »', async () => {
    const articles = [
      { id: 7, title: 'Info cochée', _status: 'published', isInfoOfDay: true, publishedAt: ago(5 * DAY) },
      { id: 8, title: 'Dernière info', _status: 'published', isInfoOfDay: false, publishedAt: ago(HOUR) },
      { id: 9, title: 'Info programmée', _status: 'published', isInfoOfDay: true, publishedAt: later(HOUR) },
    ]
    expect((await dashboard({ articles })).infoOfDay).toEqual({ id: 7, title: 'Info cochée', picked: true })
    expect((await dashboard({ articles: articles.slice(1) })).infoOfDay).toEqual({ id: 8, title: 'Dernière info', picked: false })
  })
})

describe('sortie du week-end', () => {
  const event = (id: number, over: Doc) => ({ id, title: `Sortie ${id}`, _status: 'published', isWeekendPick: false, ...over })

  it('le prochain événement coché, à venir ou encore en cours (comme « À la une »)', async () => {
    const events = [
      event(1, { isWeekendPick: true, startDate: ago(3 * DAY), endDate: ago(DAY) }), // terminé
      event(2, { isWeekendPick: true, startDate: ago(DAY), endDate: later(DAY) }), // en cours
      event(3, { isWeekendPick: true, startDate: later(3 * DAY) }),
      event(4, { isWeekendPick: true, _status: 'draft', startDate: later(HOUR) }),
      event(5, { startDate: later(HOUR) }),
    ]
    expect((await dashboard({ events })).weekendPick).toEqual({ id: 2, title: 'Sortie 2', picked: true })
  })

  it('aucun événement coché à venir : le prochain événement qui n’a pas encore commencé', async () => {
    const events = [
      event(1, { isWeekendPick: true, startDate: ago(3 * DAY), endDate: ago(DAY) }),
      event(2, { startDate: ago(DAY), endDate: later(DAY) }),
      event(3, { startDate: later(2 * DAY) }),
      event(4, { startDate: later(5 * DAY) }),
      event(5, { _status: 'draft', startDate: later(HOUR) }),
    ]
    expect((await dashboard({ events })).weekendPick).toEqual({ id: 3, title: 'Sortie 3', picked: false })
    expect((await dashboard({ events: events.slice(0, 2) })).weekendPick).toBeNull()
  })
})

describe('programme TV : jours sans émission parmi les 7 prochains (journées TV de 2 h à 2 h)', () => {
  const slot = (id: number, startsAt: string, status = 'published') => ({ id, startsAt, _status: status })

  it('signale les journées vides, la nuit jusqu’à 2 h comptant pour la veille', async () => {
    const schedule = [
      slot(1, '2026-10-20T23:00:00.000Z'), // mercredi 21, 1 h : journée TV du mardi 20 (hors période)
      slot(2, '2026-10-21T18:00:00.000Z'), // mercredi 21, 20 h
      slot(3, '2026-10-22T23:30:00.000Z'), // vendredi 23, 1 h 30 : journée TV du jeudi 22
      slot(4, '2026-10-24T08:00:00.000Z'), // samedi 24, 10 h
      slot(5, '2026-10-25T12:00:00.000Z', 'draft'), // dimanche 25 : brouillon, pas sur le site
      slot(6, '2026-10-27T00:00:00.000Z'), // mardi 27, 1 h (heure d'hiver) : journée TV du lundi 26
      slot(7, '2026-10-28T00:00:00.000Z'), // mercredi 28, 1 h : journée TV du mardi 27
      slot(8, '2026-10-28T02:00:00.000Z'), // mercredi 28, 3 h : au-delà des 7 jours
    ]
    expect((await dashboard({ schedule })).emptyDays).toEqual(['2026-10-23', '2026-10-25'])
  })

  it('grille vide : les 7 jours, à partir de la journée TV en cours (avant 2 h, c’est encore la veille)', async () => {
    expect((await dashboard({})).emptyDays).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    vi.setSystemTime(new Date('2026-10-21T23:30:00.000Z')) // jeudi 22, 1 h 30 à Paris
    expect((await dashboard({})).emptyDays[0]).toBe('2026-10-21')
  })
})

describe('publicités, messages et images manquantes', () => {
  it('campagnes en cours : publiées, actives et dans leur période (heure de Paris)', async () => {
    const ad = (id: number, over: Doc) => ({ id, _status: 'published', active: true, startsAt: null, endsAt: null, ...over })
    const ads = [
      ad(1, { startsAt: '2026-10-21T12:00:00.000Z', endsAt: '2026-10-21T12:00:00.000Z' }), // aujourd'hui seulement
      ad(2, {}),
      ad(3, { _status: 'draft' }),
      ad(4, { active: false }),
      ad(5, { endsAt: '2026-10-20T12:00:00.000Z' }), // terminée hier
      ad(6, { startsAt: '2026-10-22T12:00:00.000Z' }), // commence demain
    ]
    expect((await dashboard({ ads })).ads).toBe(2)
  })

  it('messages à traiter : ceux qui ne sont pas cochés « Traité » (case jamais touchée comprise)', async () => {
    const messages = [{ id: 1, handled: true }, { id: 2, handled: false }, { id: 3, handled: null }, { id: 4 }]
    expect((await dashboard({ messages })).messages).toBe(3)
  })

  it('vidéos et replays en ligne sans image (YouTube injoignable à l’enregistrement)', async () => {
    const videos = [
      { id: 1, _status: 'published', thumbnail: null },
      { id: 2, _status: 'published', thumbnail: 12 },
      { id: 3, _status: 'draft', thumbnail: null },
      { id: 4, _status: 'published' },
    ]
    const replays = [{ id: 1, _status: 'published', thumbnail: null }]
    expect((await dashboard({ videos, replays })).missingImages).toEqual({ videos: 2, replays: 1 })
  })
})

describe('derniers contenus modifiés', () => {
  it('les 6 plus récents, toutes rubriques confondues, brouillons signalés « À publier », titre de repli', async () => {
    const doc = (id: number, hours: number, over: Doc = {}) => ({ id, title: `Contenu ${id}`, updatedAt: ago(hours * HOUR), _status: 'published', ...over })
    const store = {
      videos: [doc(1, 1), doc(2, 30), doc(3, 31), doc(4, 32), doc(5, 33), doc(6, 34), doc(7, 35)],
      articles: [doc(10, 2, { _status: 'draft' }), doc(11, 40)],
      events: [doc(20, 3, { title: '' })],
      replays: [doc(30, 4)],
    }
    const { recent } = await dashboard(store)
    expect(recent).toEqual([
      { collection: 'videos', id: 1, title: 'Contenu 1', updatedAt: ago(HOUR), draft: false },
      { collection: 'articles', id: 10, title: 'Contenu 10', updatedAt: ago(2 * HOUR), draft: true },
      { collection: 'events', id: 20, title: 'Sans titre', updatedAt: ago(3 * HOUR), draft: false },
      { collection: 'replays', id: 30, title: 'Contenu 30', updatedAt: ago(4 * HOUR), draft: false },
      { collection: 'videos', id: 2, title: 'Contenu 2', updatedAt: ago(30 * HOUR), draft: false },
      { collection: 'videos', id: 3, title: 'Contenu 3', updatedAt: ago(31 * HOUR), draft: false },
    ])
  })

  it('les dernières versions sont demandées (brouillons compris)', async () => {
    const payload = fakePayload({})
    await getDashboardData(payload)
    const calls = (payload.find as unknown as { mock: { calls: [Args & { draft?: boolean }][] } }).mock.calls.map(([args]) => args)
    for (const collection of ['videos', 'articles', 'events', 'replays']) {
      expect(calls.some((a) => a.collection === collection && a.draft === true && a.sort === '-updatedAt')).toBe(true)
    }
  })
})

describe('le direct, le flash info et la météo', () => {
  const live = async (settings: Doc) => (await dashboard({}, { settings })).live

  it('direct activé (par défaut) et flux renseigné selon la source choisie', async () => {
    const youtube = { provider: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    expect(await live({ live: youtube })).toEqual({ enabled: true, configured: true })
    expect(await live({ live: { provider: 'twitch', twitchUrl: 'https://www.twitch.tv/swattertv' } })).toEqual({ enabled: true, configured: true })
    vi.stubEnv('NEXT_PUBLIC_BUNNY_LIBRARY_ID', '123456')
    expect(await live({ live: { provider: 'bunny', bunnyVideoId: 'abc-123' } })).toEqual({ enabled: true, configured: true })
    expect(await live({ live: { provider: 'url', url: 'https://flux.example.fr/live.m3u8' } })).toEqual({ enabled: true, configured: true })
    expect(await live({ live: { provider: 'upload', file: 42 } })).toEqual({ enabled: true, configured: true })
  })

  it('direct sans flux exploitable : « activé, mais aucun flux » (à vérifier)', async () => {
    expect(await live({})).toEqual({ enabled: true, configured: false })
    expect(await live({ live: { provider: 'youtube', youtubeUrl: '' } })).toEqual({ enabled: true, configured: false })
    expect(await live({ live: { provider: 'twitch', twitchUrl: 'https://www.youtube.com/@swattertv' } })).toEqual({ enabled: true, configured: false })
    expect(await live({ live: { provider: 'bunny' } })).toEqual({ enabled: true, configured: false })
    // vidéo Bunny sans bibliothèque (NEXT_PUBLIC_BUNNY_LIBRARY_ID) : la page Direct ne peut pas la lire
    vi.stubEnv('NEXT_PUBLIC_BUNNY_LIBRARY_ID', '')
    expect(await live({ live: { provider: 'bunny', bunnyVideoId: 'abc-123' } })).toEqual({ enabled: true, configured: false })
    expect(await live({ live: { provider: 'upload', file: null } })).toEqual({ enabled: true, configured: false })
  })

  it('un lien YouTube qui ne désigne aucune vidéo (adresse de la chaîne) n’est pas un flux : la page Direct ne lira rien', async () => {
    expect(await live({ live: { provider: 'youtube', youtubeUrl: 'https://www.youtube.com/@swattertv' } })).toEqual({ enabled: true, configured: false })
  })

  it('direct décoché : désactivé', async () => {
    expect((await live({ liveEnabled: false, live: { provider: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' } })).enabled).toBe(false)
    expect((await live({ liveEnabled: true })).enabled).toBe(true)
  })

  it('flash info : nombre de messages, complément automatique coché par défaut', async () => {
    const flash = async (settings: Doc) => (await dashboard({}, { settings })).flash
    expect(await flash({})).toEqual({ messages: 0, auto: true })
    expect(await flash({ flashItems: [{ text: 'a' }, { text: 'b' }], flashAuto: false })).toEqual({ messages: 2, auto: false })
  })

  it('météo : heure de l’import lue dans les prévisions (pas la date de modification de la fiche)', async () => {
    const meteo = async (doc: Doc) => (await dashboard({}, { meteo: doc })).meteo
    // fiche modifiée il y a 5 minutes (un bulletin), prévisions importées il y a 4 heures
    const doc = { autoUpdate: true, updatedAt: ago(5 * 60 * 1000), forecast: { updatedAt: ago(4 * HOUR) } }
    expect(await meteo(doc)).toEqual({ auto: true, updatedAt: ago(4 * HOUR) })
    expect(await meteo({ updatedAt: ago(HOUR) })).toEqual({ auto: true, updatedAt: null })
    expect(await meteo({ autoUpdate: false, forecast: null })).toEqual({ auto: false, updatedAt: null })
  })
})

describe('espace membres', () => {
  const member = (id: number, over: Doc = {}) => ({ id, createdAt: ago(30 * DAY), blocked: false, ...over })
  const watch = (kind: string, itemId: number, when: string) => ({ kind, itemId, watchedAt: when })

  it('aucun compte : rien sur le tableau de bord', async () => {
    expect((await dashboard({ members: [] })).members).toBeNull()
  })

  it('membres non suspendus, inscrits des 7 derniers jours, inscriptions ouvertes par défaut', async () => {
    const members = [
      member(1),
      member(2, { createdAt: ago(2 * DAY) }),
      member(3, { createdAt: ago(DAY), blocked: true }),
      member(4, { createdAt: ago(6 * DAY), blocked: null }),
      member(5, { createdAt: ago(8 * DAY) }),
    ]
    expect((await dashboard({ members })).members).toEqual({ active: 4, newThisWeek: 2, signupOpen: true, topWatched: [] })
    expect((await dashboard({ members }, { settings: { members: { signupOpen: false } } })).members?.signupOpen).toBe(false)
  })

  it('« Les plus regardées » : membres différents par contenu sur 7 jours, 5 au plus, contenus supprimés ignorés', async () => {
    const times = (n: number, kind: string, itemId: number, when: string) => Array.from({ length: n }, () => watch(kind, itemId, when))
    const history = [
      ...times(6, 'video', 10, ago(HOUR)),
      ...times(5, 'replay', 20, ago(2 * DAY)),
      ...times(4, 'video', 30, ago(3 * DAY)),
      ...times(3, 'video', 40, ago(6 * DAY)),
      ...times(2, 'video', 50, ago(5 * DAY)),
      ...times(1, 'video', 60, ago(4 * DAY)),
      // plus de 7 jours : hors classement, même très regardé
      ...times(7, 'video', 99, ago(8 * DAY)),
    ]
    // le contenu 30 a été supprimé depuis ; le replay 20 n'a pas de titre
    const title = (r: Ref) => (r.itemId === 20 ? '' : `Contenu ${r.itemId}`)
    vi.mocked(loadItems).mockImplementation(async (_p, refs) => items(refs.filter((r) => r.itemId !== 30), title))
    const stats = (await dashboard({ members: [member(1)], 'member-history': history })).members
    expect(stats?.topWatched).toEqual([
      { kind: 'video', id: 10, title: 'Contenu 10', href: '/video/10', members: 6 },
      { kind: 'replay', id: 20, title: 'Sans titre', href: '/replay/20', members: 5 },
      { kind: 'video', id: 40, title: 'Contenu 40', href: '/video/40', members: 3 },
      { kind: 'video', id: 50, title: 'Contenu 50', href: '/video/50', members: 2 },
      { kind: 'video', id: 60, title: 'Contenu 60', href: '/video/60', members: 1 },
    ])
    // titres et liens de tous les contenus, même retirés du site (statistiques de l'équipe)
    expect(vi.mocked(loadItems).mock.calls[0][2]).toEqual({ publicOnly: false })
    expect(vi.mocked(loadItems).mock.calls[0][1].map((r) => r.itemId)).not.toContain(99)
  })

  it('classement en échec : les chiffres des membres restent affichés', async () => {
    vi.mocked(loadItems).mockRejectedValue(new Error('panne'))
    const stats = (await dashboard({ members: [member(1)], 'member-history': [watch('video', 10, ago(HOUR))] })).members
    expect(stats).toEqual({ active: 1, newThisWeek: 0, signupOpen: true, topWatched: [] })
  })
})

describe('une requête en échec n’empêche pas le tableau de bord de s’afficher', () => {
  it('vidéos injoignables : cases des vidéos vides, le reste affiché, erreur dans le journal', async () => {
    const store = {
      videos: [{ id: 1, title: 'V', _status: 'published', publishedAt: ago(HOUR), updatedAt: ago(HOUR) }],
      articles: [{ id: 2, title: 'A', _status: 'published', publishedAt: ago(HOUR), updatedAt: ago(HOUR) }],
    }
    const data = await dashboard(store, {}, ['find:videos', 'count:videos'])
    expect(data.videoOfDay).toBeNull()
    expect(data.missingImages.videos).toBe(0)
    expect(data.infoOfDay).toEqual({ id: 2, title: 'A', picked: false })
    expect(errors).toHaveBeenCalledWith('[swatter] Tableau de bord :', expect.stringContaining('panne simulée'))
  })

  it('réglages illisibles : valeurs par défaut (direct activé sans flux, flash automatique, inscriptions ouvertes)', async () => {
    const data = await dashboard({ members: [{ id: 1, createdAt: ago(DAY) }] }, {}, ['global:settings', 'global:meteo'])
    expect(data.live).toEqual({ enabled: true, configured: false })
    expect(data.flash).toEqual({ messages: 0, auto: true })
    expect(data.meteo).toEqual({ auto: true, updatedAt: null })
    expect(data.members?.signupOpen).toBe(true)
  })

  it('tout en panne : un tableau de bord vide mais complet, sans état rassurant inventé (grille, publicités, messages : inconnus)', async () => {
    const all = ['videos', 'articles', 'events', 'replays', 'schedule', 'ads', 'messages', 'members', 'member-history']
    const data = await dashboard({}, {}, [...all.flatMap((c) => [`find:${c}`, `count:${c}`]), 'global:settings', 'global:meteo'])
    expect(data).toEqual({
      live: { enabled: true, configured: false },
      videoOfDay: null,
      infoOfDay: null,
      weekendPick: null,
      flash: { messages: 0, auto: true },
      emptyDays: null,
      ads: null,
      messages: null,
      meteo: { auto: true, updatedAt: null },
      missingImages: { videos: 0, replays: 0 },
      recent: [],
      members: null,
    })
  })
})
