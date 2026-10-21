/**
 * Remplace le texte des pages légales par celui du code (src/scripts/seed/pages.ts), SANS toucher au reste du site.
 * Usage : npm run maj-pages                      (mentions légales, crédits, vie privée)
 *         npm run maj-pages -- mentions-legales  (une ou plusieurs pages, par leur adresse)
 *
 * La page est publiée ; son ancien texte reste dans son historique (administration › la page › « Versions »).
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { lexical } from './seed/lexical'
import { PAGES } from './seed/pages'

const DEFAULT = ['mentions-legales', 'credits', 'vie-privee']
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const slugs = wanted.length ? wanted : DEFAULT

const payload = await getPayload({ config })
for (const slug of slugs) {
  const page = PAGES.find((p) => p.slug === slug)
  if (!page) {
    payload.logger.error(`Page inconnue : ${slug} (adresses possibles : ${PAGES.map((p) => p.slug).join(', ')})`)
    continue
  }
  const data = {
    _status: 'published' as const,
    title: page.title,
    slug: page.slug,
    intro: page.intro,
    content: lexical(page.body),
    footerGroup: page.footerGroup,
    meta: { title: `${page.title} — Swatter TV`, description: page.metaDescription },
  }
  const existing = (await payload.find({ collection: 'pages', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true, draft: true })).docs[0]
  if (existing) await payload.update({ collection: 'pages', id: existing.id, data, overrideAccess: true })
  else await payload.create({ collection: 'pages', data, overrideAccess: true })
  payload.logger.info(`${existing ? 'Mise à jour' : 'Création'} : « ${page.title} » (/${slug})`)
}
process.exit(0)
