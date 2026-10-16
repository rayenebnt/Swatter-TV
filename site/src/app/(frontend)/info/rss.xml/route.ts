// Flux RSS sortant de L'Info : les articles de la rédaction (les reprises de flux RSS externes n'y figurent pas).
import { departmentLabel } from '@/lib/departments'
import { mediaUrl } from '@/lib/media'
import { getOwnArticles } from '@/lib/queries/articles'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { articleUrl } from '@/lib/urls'

export const revalidate = 300

/** Texte sûr pour XML : caractères de contrôle retirés, caractères spéciaux échappés. */
const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export async function GET() {
  const articles = await getOwnArticles(30)
  const items = articles.map((a) => {
    const link = absoluteUrl(articleUrl(a))
    const image = mediaUrl(a.image, 'card')
    return [
      '<item>',
      `<title>${esc(a.title)}</title>`,
      `<link>${esc(link)}</link>`,
      `<guid isPermaLink="true">${esc(link)}</guid>`,
      `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>`,
      `<category>${esc(departmentLabel(a.department))}</category>`,
      a.kicker?.trim() ? `<category>${esc(a.kicker.trim())}</category>` : '',
      a.excerpt?.trim() ? `<description>${esc(a.excerpt.trim())}</description>` : '',
      image ? `<media:content url="${esc(absoluteUrl(image))}" medium="image"/>` : '',
      '</item>',
    ].join('')
  })
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    `<title>${esc(`L’Info — ${SITE_NAME}`)}</title>`,
    `<link>${esc(absoluteUrl('/info'))}</link>`,
    `<description>${esc('L’actualité d’Auvergne-Rhône-Alpes par la rédaction de Swatter TV, la chaîne locale de la Haute-Savoie.')}</description>`,
    '<language>fr-FR</language>',
    `<atom:link href="${esc(absoluteUrl('/info/rss.xml'))}" rel="self" type="application/rss+xml"/>`,
    articles[0] ? `<lastBuildDate>${new Date(articles[0].publishedAt).toUTCString()}</lastBuildDate>` : '',
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n')
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
