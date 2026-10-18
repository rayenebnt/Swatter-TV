import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import path from 'node:path'

/**
 * Faux YouTube pour tester l'import sans Internet : page de chaîne (@swattertv-test), flux RSS et vignettes.
 * Le serveur du site doit être lancé avec YOUTUBE_BASE=http://127.0.0.1:<port> et YOUTUBE_THUMB_BASE=http://127.0.0.1:<port>/vi.
 */
export const MOCK_CHANNEL_ID = 'UCswatterTVtestChannel01'
export const MOCK_VIDEOS = [
  { id: 'swTest00001', title: 'Test import — Le marché d’Annecy', published: '2026-10-10T08:00:00+00:00' },
  { id: 'swTest00002', title: 'Test import — Balade au Semnoz', published: '2026-10-12T08:00:00+00:00' },
  { id: 'swTest00003', title: 'Test import — Le journal des Alpes', published: '2026-10-14T08:00:00+00:00' },
]

const feed = (videos: typeof MOCK_VIDEOS) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Swatter TV test</title>
  ${[...videos]
    .reverse()
    .map(
      (v) => `<entry>
    <id>yt:video:${v.id}</id><yt:videoId>${v.id}</yt:videoId><yt:channelId>${MOCK_CHANNEL_ID}</yt:channelId>
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
    } else if (/^\/vi\/[\w-]{11}\/maxresdefault\.jpg$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'image/jpeg' })
      res.end(thumb)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
