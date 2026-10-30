import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import path from 'node:path'

/**
 * Faux YouTube pour tester l'import sans Internet : page de chaîne (@swattertv-test), flux RSS, vignettes et les 3 images
 * prises dans chaque vidéo (maxres1-3, sd1-3, mq1-3 : aperçu animé en diaporama).
 * Le serveur du site doit être lancé avec YOUTUBE_BASE=http://127.0.0.1:<port> et YOUTUBE_THUMB_BASE=http://127.0.0.1:<port>/vi.
 */
export const MOCK_CHANNEL_ID = 'UCswatterTVtestChannel01'
/** Un Short, une vidéo de 4 minutes et une émission de 45 minutes (titre commençant par celui d'une émission). */
export const MOCK_VIDEOS = [
  { id: 'swTest00001', title: 'Test import — Le marché d’Annecy', published: '2026-10-10T08:00:00+00:00', seconds: 42, short: true },
  { id: 'swTest00002', title: 'Test import — Balade au Semnoz', published: '2026-10-12T08:00:00+00:00', seconds: 245, short: false },
  { id: 'swTest00003', title: 'Test import émission — numéro du 14 octobre', published: '2026-10-14T08:00:00+00:00', seconds: 2700, short: false },
]
/** Émission à laquelle le replay de 45 minutes doit être rattaché. */
export const MOCK_PROGRAM = 'Test import émission'

const feed = (videos: typeof MOCK_VIDEOS) => `<?xml version="1.0" encoding="UTF-8"?>
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

export function startYoutubeMock(port: number, videos = MOCK_VIDEOS): Promise<Server> {
  const thumb = readFileSync(path.resolve(process.cwd(), 'public/og/hero-matin.jpg'))
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/@swattertv-test') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<html><head><link rel="canonical" href="https://www.youtube.com/channel/${MOCK_CHANNEL_ID}"></head><body></body></html>`)
    } else if (url.pathname === '/feeds/videos.xml' && url.searchParams.get('channel_id') === MOCK_CHANNEL_ID) {
      res.writeHead(200, { 'content-type': 'application/atom+xml' })
      res.end(feed(videos))
    } else if (url.pathname === '/watch' && videos.some((v) => v.id === url.searchParams.get('v'))) {
      // page d'une vidéo : sa durée, comme dans le code de la vraie page
      const v = videos.find((x) => x.id === url.searchParams.get('v'))!
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<html><head><meta itemprop="duration" content="PT${v.seconds}S"></head><body><script>var x = {"lengthSeconds":"${v.seconds}"}</script></body></html>`)
    } else if (/^\/vi\/[\w-]{11}\/(?:maxresdefault|(?:maxres|sd|mq)[1-3])\.jpg$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'image/jpeg' })
      res.end(thumb)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
