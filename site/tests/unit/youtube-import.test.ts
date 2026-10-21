// Tests unitaires de l’import de la chaîne YouTube (src/lib/import/youtube.ts), sans réseau : adresse de chaîne →
// identifiant, lecture du flux RSS (faux flux bâti comme celui de tests/e2e/youtube-mock.ts), durées ISO 8601,
// rubrique de chaque vidéo (Shorts et vidéos courtes / émissions longues), émission d’un replay d’après son titre,
// résumé de l’import, et appels à YouTube (page de la chaîne, page d’une vidéo, API) avec un faux fetch.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  channelVideos,
  clip,
  clockDuration,
  destination,
  importSummary,
  isoSeconds,
  matchProgram,
  minutesDuration,
  pageSeconds,
  parseChannel,
  parseChannelFeed,
  resolveChannelId,
  youtubeIdOf,
} from '@/lib/import/youtube'
import { MOCK_CHANNEL_ID, MOCK_PROGRAM, MOCK_VIDEOS } from '../e2e/youtube-mock'

type MockVideo = (typeof MOCK_VIDEOS)[number]

/** Flux RSS d'une chaîne, au format de YouTube (même gabarit que le faux YouTube des tests de bout en bout). */
const feed = (videos: readonly MockVideo[]) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Swatter TV test</title>
  ${[...videos]
    .reverse()
    .map(
      (v) => `<entry>
    <id>yt:video:${v.id}</id><yt:videoId>${v.id}</yt:videoId><yt:channelId>${MOCK_CHANNEL_ID}</yt:channelId>
    <link rel="alternate" href="https://www.youtube.com/${v.short ? `shorts/${v.id}` : `watch?v=${v.id}`}"/>
    <title>${v.title}</title><published>${v.published}</published>
    <media:group><media:title>${v.title}</media:title><media:description>Description de « ${v.title} ».</media:description></media:group>
  </entry>`,
    )
    .join('\n  ')}
</feed>`

/** Flux d'une seule vidéo, titre et contenu libres. */
const oneEntry = (title: string, { id = 'swTest00001', extra = '' }: { id?: string; extra?: string } = {}) =>
  `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>${id}</yt:videoId><link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/>
    <title>${title}</title><published>2026-10-14T08:00:00+00:00</published>${extra}
  </entry>
</feed>`

/** Faux fetch : chaque appel est confié à `route` (adresse analysée, options de la requête). */
function stubFetch(route: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => route(new URL(String(input)), init))
  vi.stubGlobal('fetch', fn)
  return fn
}
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } })
const json = (body: unknown, status = 200) => Response.json(body, { status })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('parseChannel : adresse de la chaîne collée dans l’administration', () => {
  it('pseudo (@…), seul ou dans une adresse de la chaîne ou de l’une de ses pages', () => {
    expect(parseChannel('@swattertv')).toEqual({ handle: '@swattertv' })
    expect(parseChannel('https://www.youtube.com/@swattertv')).toEqual({ handle: '@swattertv' })
    expect(parseChannel('youtube.com/@swattertv/videos')).toEqual({ handle: '@swattertv' })
    expect(parseChannel('https://m.youtube.com/@SwatterTV?si=abc')).toEqual({ handle: '@SwatterTV' })
    expect(parseChannel('  HTTPS://WWW.YOUTUBE.COM/@swatter.tv-74  ')).toEqual({ handle: '@swatter.tv-74' })
  })

  it('identifiant de chaîne (UC + 22 caractères), seul ou dans /channel/', () => {
    expect(parseChannel(MOCK_CHANNEL_ID)).toEqual({ id: MOCK_CHANNEL_ID })
    expect(parseChannel(`https://www.youtube.com/channel/${MOCK_CHANNEL_ID}`)).toEqual({ id: MOCK_CHANNEL_ID })
    expect(parseChannel(`https://www.youtube.com/channel/${MOCK_CHANNEL_ID}/videos`)).toEqual({ id: MOCK_CHANNEL_ID })
  })

  it('anciennes adresses /c/ et /user/', () => {
    expect(parseChannel('https://www.youtube.com/c/SwatterTV')).toEqual({ path: 'c/SwatterTV' })
    expect(parseChannel('youtube.com/user/swattertv')).toEqual({ path: 'user/swattertv' })
  })

  it('refuse le reste : vide, autre site, vidéo, identifiant ou pseudo invalide', () => {
    for (const input of [
      null,
      undefined,
      '',
      '   ',
      'UCtropCourt',
      '@ab',
      `@${'a'.repeat(31)}`,
      'https://www.youtube.com/',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/channel/',
      'https://www.youtube.com/channel/UCtropCourt',
      'https://www.youtube.com/c/',
      'https://www.youtube.com/c/Swatter%20TV',
      'https://evil.com/@swattertv',
      'https://notyoutube.com/@swattertv',
      'https://youtube.com.evil.com/@swattertv',
      'ftp://www.youtube.com/@swattertv',
      'javascript:alert(1)',
    ]) {
      expect(parseChannel(input), String(input)).toBeNull()
    }
  })

  it('une adresse mal encodée est refusée, sans lever d’exception', () => {
    expect(() => parseChannel('https://www.youtube.com/%E0%A4%A')).not.toThrow()
    expect(parseChannel('https://www.youtube.com/%E0%A4%A')).toBeNull()
  })
})

describe('parseChannelFeed : flux RSS public de la chaîne', () => {
  it('les vidéos du flux, des plus récentes aux plus anciennes, Shorts repérés par leur lien /shorts/', () => {
    expect(parseChannelFeed(feed(MOCK_VIDEOS))).toEqual(
      [...MOCK_VIDEOS].reverse().map((v) => ({
        id: v.id,
        title: v.title,
        description: `Description de « ${v.title} ».`,
        publishedAt: new Date(v.published).toISOString(),
        seconds: null,
        short: v.short,
      })),
    )
  })

  it('une seule vidéo, ou aucune', () => {
    expect(parseChannelFeed(feed(MOCK_VIDEOS.slice(0, 1)))).toHaveLength(1)
    expect(parseChannelFeed(feed([]))).toEqual([])
  })

  it('entrées sans identifiant valide ou sans titre ignorées', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
      <entry><yt:videoId>court</yt:videoId><title>Identifiant trop court</title></entry>
      <entry><yt:videoId>swTest00009</yt:videoId><title>   </title></entry>
      <entry><title>Sans identifiant</title></entry>
      <entry><yt:videoId>swTest00010</yt:videoId><title>Gardée</title></entry>
    </feed>`
    expect(parseChannelFeed(xml).map((v) => v.id)).toEqual(['swTest00010'])
  })

  it('valeurs nettoyées : espaces retirés, date illisible → null, description absente → vide', () => {
    const [v] = parseChannelFeed(oneEntry('   Titre espacé  ').replace('2026-10-14T08:00:00+00:00', 'hier'))
    expect(v).toMatchObject({ title: 'Titre espacé', publishedAt: null, description: '', short: false })
  })

  it('plusieurs liens : un lien /shorts/ suffit', () => {
    const extra = '<link rel="related" href="https://www.youtube.com/shorts/swTest00001"/>'
    expect(parseChannelFeed(oneEntry('Court', { extra }))[0].short).toBe(true)
  })

  it('entités XML et CDATA décodées', () => {
    expect(parseChannelFeed(oneEntry('Annecy &amp; Thônes &lt;en direct&gt; &quot;bis&quot;'))[0].title).toBe('Annecy & Thônes <en direct> "bis"')
    expect(parseChannelFeed(oneEntry('<![CDATA[L’été <b>au lac</b>]]>'))[0].title).toBe('L’été <b>au lac</b>')
  })

  it('références numériques de caractères décodées (&#39;, &#x2019;)', () => {
    expect(parseChannelFeed(oneEntry('L&#39;été à l&#x2019;Alpe'))[0].title).toBe("L'été à l’Alpe")
  })

  it('un titre qui ressemble à un nombre ou à un booléen est gardé tel quel', () => {
    for (const title of ['007', '2.0', '1e3', 'true']) {
      expect(
        parseChannelFeed(oneEntry(title)).map((v) => v.title),
        title,
      ).toEqual([title])
    }
  })

  it('autre chose qu’un flux : erreur explicite', () => {
    for (const xml of ['', 'pas du XML', '<html><body>Erreur 500</body></html>']) expect(() => parseChannelFeed(xml), xml).toThrow('flux YouTube illisible')
  })
})

describe('durées', () => {
  it('ISO 8601 (API YouTube) → secondes', () => {
    expect(isoSeconds('PT45S')).toBe(45)
    expect(isoSeconds('PT4M5S')).toBe(245)
    expect(isoSeconds('PT20M')).toBe(1200)
    expect(isoSeconds('PT1H2M3S')).toBe(3723)
    expect(isoSeconds('PT2H0M0S')).toBe(7200)
    expect(isoSeconds('PT90M')).toBe(5400)
    expect(isoSeconds('P1DT2H')).toBe(93600)
  })

  it('durée nulle (direct), absente ou illisible : null', () => {
    for (const v of ['PT0S', 'P0D', 'PT', 'P', '', null, undefined, '1H2M', 'pt1h', 'PT1.5S', 'P1W', ' PT1M']) expect(isoSeconds(v), String(v)).toBeNull()
  })

  it('durée d’une vidéo : « 04:05 », « 59:59 », « 1:02:03 »', () => {
    expect(clockDuration(42)).toBe('00:42')
    expect(clockDuration(245)).toBe('04:05')
    expect(clockDuration(3599)).toBe('59:59')
    expect(clockDuration(3600)).toBe('1:00:00')
    expect(clockDuration(3723)).toBe('1:02:03')
    expect(clockDuration(0)).toBeNull()
    expect(clockDuration(null)).toBeNull()
  })

  it('durée d’un replay, comme dans la grille : « 52 min », « 1 h 15 », « 2 h », une minute au moins', () => {
    expect(minutesDuration(3120)).toBe('52 min')
    expect(minutesDuration(2700)).toBe('45 min')
    expect(minutesDuration(4500)).toBe('1 h 15')
    expect(minutesDuration(3600)).toBe('1 h')
    expect(minutesDuration(7200)).toBe('2 h')
    expect(minutesDuration(3723)).toBe('1 h 02')
    expect(minutesDuration(20)).toBe('1 min')
    expect(minutesDuration(89)).toBe('1 min')
    expect(minutesDuration(91)).toBe('2 min')
    expect(minutesDuration(0)).toBeNull()
    expect(minutesDuration(null)).toBeNull()
  })
})

describe('destination : rubrique de chaque vidéo', () => {
  it('les vidéos du faux YouTube : Short et vidéo de 4 minutes dans « Vidéos », émission de 45 minutes dans « Replays »', () => {
    expect(MOCK_VIDEOS.map((v) => destination(v, 20))).toEqual(['videos', 'videos', 'replays'])
  })

  it('« Replays » à partir de la durée réglée (20 min par défaut dans l’administration), seuil compris', () => {
    expect(destination({ seconds: 20 * 60, short: false }, 20)).toBe('replays')
    expect(destination({ seconds: 20 * 60 - 1, short: false }, 20)).toBe('videos')
    expect(destination({ seconds: 10 * 60, short: false }, 10)).toBe('replays')
    expect(destination({ seconds: 3 * 3600, short: false }, 20)).toBe('replays')
  })

  it('Shorts et vidéos d’une minute ou moins toujours dans « Vidéos », même avec un seuil très bas', () => {
    expect(destination({ seconds: 5000, short: true }, 20)).toBe('videos')
    expect(destination({ seconds: 60, short: false }, 0.5)).toBe('videos')
    expect(destination({ seconds: 61, short: false }, 1)).toBe('replays')
  })

  it('durée inconnue : « Vidéos »', () => {
    expect(destination({ seconds: null, short: false }, 20)).toBe('videos')
  })
})

describe('matchProgram : émission d’un replay d’après son titre', () => {
  const programs = [
    { id: 1, title: 'Le journal' },
    { id: 2, title: 'Le journal des Alpes' },
    { id: 3, title: MOCK_PROGRAM },
    { id: 4, title: 'L’Agenda' },
    { id: 5, title: 'TV' },
    { id: 6, title: 'Le Mag' },
    { id: 7, title: 'Sport' },
  ]

  it('le replay du faux YouTube est rattaché à son émission', () => {
    expect(matchProgram(MOCK_VIDEOS[2].title, programs)).toBe(3)
  })

  it('titre qui commence par le nom de l’émission, sans tenir compte de la casse ni des accents ; le plus long l’emporte', () => {
    expect(matchProgram('Le journal — 14 octobre', programs)).toBe(1)
    expect(matchProgram('LE JOURNAL DES ALPES — Soir', programs)).toBe(2)
    expect(matchProgram('test import EMISSION : spécial', programs)).toBe(3)
    expect(matchProgram("L'agenda du week-end", programs)).toBe(4)
  })

  it('à défaut, nom de l’émission présent dans le titre', () => {
    expect(matchProgram('Spécial : Le journal des Alpes', programs)).toBe(2)
    expect(matchProgram('Le derby — Sport', programs)).toBe(7)
  })

  it('aucune correspondance, liste vide ou nom d’émission de moins de 3 caractères : aucune émission', () => {
    expect(matchProgram('Balade au Semnoz', programs)).toBeNull()
    expect(matchProgram('TV Annecy', programs)).toBeNull()
    expect(matchProgram('Le journal', [])).toBeNull()
  })

  it('le nom de l’émission doit former des mots entiers dans le titre', () => {
    expect(matchProgram('Le journalisme en question', programs)).toBeNull()
    expect(matchProgram('Le Magnifique lac d’Annecy', programs)).toBeNull()
    expect(matchProgram('Les transports en commun', programs)).toBeNull()
  })
})

describe('importSummary : résultat noté dans « Dernier import »', () => {
  it('vidéos ajoutées dans chaque rubrique, sur le nombre de vidéos lues', () => {
    expect(importSummary({ videos: 3, replays: 2, total: 15 })).toBe('3 vidéos dans « Vidéos » et 2 vidéos dans « Replays » (sur 15 vidéos lues sur la chaîne)')
    expect(importSummary({ videos: 2, replays: 0, total: 15 })).toBe('2 vidéos dans « Vidéos » (sur 15 vidéos lues sur la chaîne)')
    expect(importSummary({ videos: 0, replays: 1, total: 2 })).toBe('1 vidéo dans « Replays » (sur 2 vidéos lues sur la chaîne)')
  })

  it('rien de nouveau', () => {
    expect(importSummary({ videos: 0, replays: 0, total: 15 })).toBe('rien à ajouter : 15 vidéos de la chaîne, toutes déjà sur le site')
  })

  it('accord au singulier quand la chaîne n’a qu’une vidéo', () => {
    expect(importSummary({ videos: 1, replays: 0, total: 1 })).toBe('1 vidéo dans « Vidéos » (sur 1 vidéo lue sur la chaîne)')
    expect(importSummary({ videos: 0, replays: 0, total: 1 })).not.toContain('toutes')
  })
})

describe('youtubeIdOf et clip : outils de la synchronisation', () => {
  it('identifiant YouTube d’une fiche du site (adresse créée par l’import ou saisie par l’équipe)', () => {
    expect(youtubeIdOf('https://www.youtube.com/watch?v=swTest00002')).toBe('swTest00002')
    expect(youtubeIdOf('https://youtu.be/swTest00002?si=x')).toBe('swTest00002')
    expect(youtubeIdOf('https://www.youtube.com/shorts/swTest00001')).toBe('swTest00001')
    expect(youtubeIdOf('https://www.youtube.com/live/swTest00003')).toBe('swTest00003')
    expect(youtubeIdOf('https://www.youtube.com/embed/swTest00003')).toBe('swTest00003')
    expect(youtubeIdOf('https://www.youtube.com/@swattertv')).toBeNull()
    expect(youtubeIdOf(null)).toBeNull()
    expect(youtubeIdOf(42)).toBeNull()
  })

  it('titres et descriptions trop longs coupés avec « … », sans espace avant', () => {
    expect(clip('Court', 200)).toBe('Court')
    expect(clip('a'.repeat(200), 200)).toBe('a'.repeat(200))
    const long = clip('a'.repeat(250), 200)
    expect(long).toHaveLength(200)
    expect(long.endsWith('…')).toBe(true)
    // coupe juste après une espace : l'espace ne reste pas devant « … »
    expect(clip(`${'a'.repeat(198)} bcd`, 200)).toBe(`${'a'.repeat(198)}…`)
  })
})

describe('resolveChannelId : identifiant (UC…) de la chaîne', () => {
  it('identifiant déjà connu : rendu tel quel, sans appel à YouTube', async () => {
    const fetchSpy = stubFetch(() => html('', 500))
    await expect(resolveChannelId({ id: MOCK_CHANNEL_ID })).resolves.toBe(MOCK_CHANNEL_ID)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sans clé : lecture de la page de la chaîne (YOUTUBE_BASE), sans bandeau de consentement, sans cache', async () => {
    vi.stubEnv('YOUTUBE_BASE', 'https://yt.test/')
    const fetchSpy = stubFetch((url) =>
      url.pathname === '/@swattertv-test'
        ? html(`<html><head><link rel="canonical" href="https://www.youtube.com/channel/${MOCK_CHANNEL_ID}"></head></html>`)
        : html('', 404),
    )
    await expect(resolveChannelId({ handle: '@swattertv-test' })).resolves.toBe(MOCK_CHANNEL_ID)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://yt.test/@swattertv-test')
    expect(init?.cache).toBe('no-store')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const headers = init?.headers as Record<string, string>
    expect(headers.cookie).toContain('SOCS=')
    expect(headers['accept-language']).toMatch(/^fr/)
  })

  it('autres emplacements de l’identifiant dans la page', async () => {
    for (const page of [
      `<meta itemprop="identifier" content="${MOCK_CHANNEL_ID}">`,
      `<script>var ytInitialData = {"externalId":"${MOCK_CHANNEL_ID}"}</script>`,
      `<script>{"channelId":"${MOCK_CHANNEL_ID}"}</script>`,
    ]) {
      stubFetch(() => html(page))
      await expect(resolveChannelId({ handle: '@swattertv' }), page).resolves.toBe(MOCK_CHANNEL_ID)
    }
  })

  it('ancienne adresse /c/… : sa page', async () => {
    vi.stubEnv('YOUTUBE_BASE', 'https://yt.test')
    const fetchSpy = stubFetch(() => html(`"externalId":"${MOCK_CHANNEL_ID}"`))
    await expect(resolveChannelId({ path: 'c/SwatterTV' }, 'cle-api')).resolves.toBe(MOCK_CHANNEL_ID)
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://yt.test/c/SwatterTV')
  })

  it('chaîne introuvable, YouTube en erreur ou page sans identifiant : messages clairs', async () => {
    stubFetch(() => html('', 404))
    await expect(resolveChannelId({ handle: '@inconnue' })).rejects.toThrow('chaîne « @inconnue » introuvable sur YouTube : vérifiez l’adresse')
    stubFetch(() => html('', 503))
    await expect(resolveChannelId({ handle: '@swattertv' })).rejects.toThrow('YouTube a répondu 503 pour la page de la chaîne')
    stubFetch(() => html('<html>Avant d’accéder à YouTube…</html>'))
    await expect(resolveChannelId({ handle: '@swattertv' })).rejects.toThrow(
      'identifiant de la chaîne introuvable dans sa page YouTube : collez plutôt l’adresse en /channel/UC…',
    )
  })

  it('avec une clé d’API : identifiant demandé à l’API (forHandle)', async () => {
    vi.stubEnv('YOUTUBE_API_BASE', 'https://api.yt.test/youtube/v3/')
    const fetchSpy = stubFetch(() => json({ items: [{ id: MOCK_CHANNEL_ID }] }))
    await expect(resolveChannelId({ handle: '@swattertv' }, 'cle&api')).resolves.toBe(MOCK_CHANNEL_ID)
    const url = new URL(String(fetchSpy.mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe('https://api.yt.test/youtube/v3/channels')
    expect(url.searchParams.get('part')).toBe('id')
    expect(url.searchParams.get('forHandle')).toBe('@swattertv')
    expect(url.searchParams.get('key')).toBe('cle&api')
  })

  it('API : erreur (quota…) ou chaîne inconnue', async () => {
    stubFetch(() => json({ error: { message: 'The request cannot be completed because you have exceeded your quota.' } }, 403))
    await expect(resolveChannelId({ handle: '@swattertv' }, 'cle')).rejects.toThrow(
      'API YouTube : The request cannot be completed because you have exceeded your quota.',
    )
    stubFetch(() => new Response('pas du JSON', { status: 500 }))
    await expect(resolveChannelId({ handle: '@swattertv' }, 'cle')).rejects.toThrow('API YouTube : erreur 500')
    stubFetch(() => json({ items: [] }))
    await expect(resolveChannelId({ handle: '@inconnue' }, 'cle')).rejects.toThrow('chaîne @inconnue introuvable sur YouTube')
    stubFetch(() => json({ items: [{ id: 'pas-un-identifiant' }] }))
    await expect(resolveChannelId({ handle: '@inconnue' }, 'cle')).rejects.toThrow('chaîne @inconnue introuvable sur YouTube')
  })
})

describe('pageSeconds : durée lue dans la page publique d’une vidéo', () => {
  it('« lengthSeconds » de la page (comme le faux YouTube)', async () => {
    vi.stubEnv('YOUTUBE_BASE', 'https://yt.test')
    const v = MOCK_VIDEOS[2]
    const fetchSpy = stubFetch(() =>
      html(
        `<html><head><meta itemprop="duration" content="PT${v.seconds}S"></head><body><script>var x = {"lengthSeconds":"${v.seconds}"}</script></body></html>`,
      ),
    )
    await expect(pageSeconds(v.id)).resolves.toBe(2700)
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`https://yt.test/watch?v=${v.id}`)
  })

  it('à défaut, la durée ISO de la balise meta', async () => {
    stubFetch(() => html('<meta itemprop="duration" content="PT4M5S">'))
    await expect(pageSeconds('swTest00002')).resolves.toBe(245)
  })

  it('introuvable, page en erreur ou réseau coupé : null, sans exception', async () => {
    stubFetch(() => html('<html></html>'))
    await expect(pageSeconds('swTest00002')).resolves.toBeNull()
    stubFetch(() => html('{"lengthSeconds":"0"}'))
    await expect(pageSeconds('swTest00002')).resolves.toBeNull()
    stubFetch(() => html('', 404))
    await expect(pageSeconds('swTest00002')).resolves.toBeNull()
    stubFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(pageSeconds('swTest00002')).resolves.toBeNull()
  })
})

describe('channelVideos : vidéos de la chaîne', () => {
  it('sans clé : le flux RSS de la chaîne', async () => {
    vi.stubEnv('YOUTUBE_BASE', 'https://yt.test')
    vi.stubEnv('YOUTUBE_API_KEY', '')
    const fetchSpy = stubFetch((url) =>
      url.pathname === '/feeds/videos.xml' && url.searchParams.get('channel_id') === MOCK_CHANNEL_ID ? html(feed(MOCK_VIDEOS)) : html('', 404),
    )
    const videos = await channelVideos(MOCK_CHANNEL_ID)
    expect(videos.map((v) => v.id)).toEqual([...MOCK_VIDEOS].reverse().map((v) => v.id))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('flux introuvable ou YouTube en erreur : messages clairs', async () => {
    stubFetch(() => html('', 404))
    await expect(channelVideos(MOCK_CHANNEL_ID, '')).rejects.toThrow('flux de la chaîne introuvable : vérifiez l’adresse de la chaîne')
    stubFetch(() => html('', 500))
    await expect(channelVideos(MOCK_CHANNEL_ID, '')).rejects.toThrow('YouTube a répondu 500 pour le flux de la chaîne')
  })

  it('avec une clé : liste « Mises en ligne » (UU…) page par page, vidéos privées ou supprimées écartées, durées par paquets de 50', async () => {
    vi.stubEnv('YOUTUBE_API_BASE', 'https://api.yt.test/youtube/v3')
    const item = (n: number, extra: Record<string, unknown> = {}) => ({
      snippet: { title: ` Vidéo ${n} `, description: ` Description ${n} `, resourceId: { videoId: `swApi${String(n).padStart(6, '0')}` } },
      contentDetails: { videoPublishedAt: `2026-10-${String((n % 28) + 1).padStart(2, '0')}T08:00:00Z` },
      ...extra,
    })
    const page1 = [...Array.from({ length: 50 }, (_, i) => item(i + 1))]
    const page2 = [
      item(51),
      { snippet: { title: 'Private video', resourceId: { videoId: 'swApi999999' } }, contentDetails: {} },
      item(52, { snippet: { title: '', resourceId: { videoId: 'swApi000052' } } }),
      item(53, { snippet: { title: 'Identifiant invalide', resourceId: { videoId: 'court' } } }),
    ]
    const fetchSpy = stubFetch((url) => {
      if (url.pathname.endsWith('/playlistItems'))
        return json(url.searchParams.get('pageToken') === 'P2' ? { items: page2 } : { items: page1, nextPageToken: 'P2' })
      const ids = (url.searchParams.get('id') ?? '').split(',')
      return json({
        items: ids.filter((id) => id !== 'swApi000002').map((id) => ({ id, contentDetails: { duration: id === 'swApi000001' ? 'PT45M' : 'PT2M5S' } })),
      })
    })
    const videos = await channelVideos(MOCK_CHANNEL_ID, 'cle')
    expect(videos).toHaveLength(51)
    expect(videos[0]).toEqual({
      id: 'swApi000001',
      title: 'Vidéo 1',
      description: 'Description 1',
      publishedAt: '2026-10-02T08:00:00.000Z',
      seconds: 2700,
      short: false,
    })
    expect(videos[1].seconds).toBeNull()
    expect(videos[50]).toMatchObject({ id: 'swApi000051', seconds: 125 })
    const urls = fetchSpy.mock.calls.map(([u]) => new URL(String(u)))
    const lists = urls.filter((u) => u.pathname.endsWith('/playlistItems'))
    expect(lists.map((u) => u.searchParams.get('playlistId'))).toEqual([`UU${MOCK_CHANNEL_ID.slice(2)}`, `UU${MOCK_CHANNEL_ID.slice(2)}`])
    expect(lists[0].searchParams.get('maxResults')).toBe('50')
    expect(lists[0].searchParams.get('key')).toBe('cle')
    const durations = urls.filter((u) => u.pathname.endsWith('/videos'))
    expect(durations.map((u) => (u.searchParams.get('id') ?? '').split(',').length)).toEqual([50, 1])
  })

  it('API en erreur : message de l’API', async () => {
    stubFetch(() => json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400))
    await expect(channelVideos(MOCK_CHANNEL_ID, 'mauvaise-cle')).rejects.toThrow('API YouTube : API key not valid. Please pass a valid API key.')
  })
})
