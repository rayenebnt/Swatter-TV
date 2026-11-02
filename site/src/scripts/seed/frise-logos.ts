// Frise « Notre logo au fil du temps » de la page « Le groupe » : les cinq logos successifs de la chaîne, en un an, du
// plus ancien au plus récent (fichiers : seed/assets/logos, mis au carré sur leur fond d'origine ; médias : media.ts).
// Utilisée par les contenus de départ (seed.ts) et par npm run frise-logos (site déjà en ligne : installLogoTimeline).
// La frise se modifie ensuite dans l'administration (Pages › Le groupe › Frise chronologique) : dates, textes, ordre.
import path from 'path'
import type { Payload } from 'payload'
import type { Media } from '@/payload-types'
import { MEDIA } from './media'

/** Adresse de la page qui porte la frise. */
export const LOGO_PAGE = 'le-groupe'

export const LOGO_TIMELINE = {
  title: 'Notre logo au fil du temps',
  intro: 'En un an, le logo de Swatter TV Info a connu cinq versions. Les voici, de la plus ancienne à la plus récente.',
  steps: [
    { media: 'logo-1-hd', title: 'Swatter TV HD', text: 'Le tout premier logo : un bouton de lecture doré marqué « HD ».' },
    { media: 'logo-2-triangle', title: 'Le triangle jaune', text: 'Le nom s’affiche en grandes lettres blanches dans un triangle jaune.' },
    { media: 'logo-3-info', title: 'Swatter TV Info', text: 'La chaîne devient Swatter TV Info : la mention « Info » se glisse entre le T et le V.' },
    { media: 'logo-4-contour', title: 'Le triangle doré', text: 'Le triangle s’affine en un contour doré, sur fond noir.' },
    { media: 'logo-5-montagnes', title: 'Le logo d’aujourd’hui', text: 'Les montagnes entrent dans le triangle : c’est le logo actuel de la chaîne.' },
  ],
}

/** Frise de la page, en données Payload : chaque logo par son numéro dans la médiathèque. */
export const logoTimelineData = (mediaId: (key: string) => number) => ({
  title: LOGO_TIMELINE.title,
  intro: LOGO_TIMELINE.intro,
  steps: LOGO_TIMELINE.steps.map((s) => ({ title: s.title, text: s.text, image: mediaId(s.media) })),
})

export type LogoTimelineReport =
  | { status: 'no-page' }
  | { status: 'pending-changes' }
  | { status: 'already-filled'; steps: number }
  | { status: 'ready' | 'done'; media: { key: string; existing: boolean }[]; replaced: number }

/** Logo déjà dans la médiathèque : fichier de ce nom (« logo-1-hd.webp », « logo-1-hd-1.webp »…). */
async function findLogo(payload: Payload, key: string): Promise<Media | null> {
  const { docs } = await payload.find({ collection: 'media', where: { filename: { like: key } }, limit: 20, depth: 0, overrideAccess: true })
  return docs.find((m) => m.filename && new RegExp(`^${key}(-\\d+)?\\.\\w+$`).test(m.filename)) ?? null
}

/**
 * Pose la frise des logos sur la page « Le groupe » d'un site déjà en ligne : logos ajoutés à la médiathèque (repris
 * s'ils y sont déjà), frise remplie dans l'ordre, page publiée ; son texte ne change pas. `confirm: false` : rien n'est
 * modifié, le compte rendu dit ce qui serait fait. Refus : page absente ; modifications en attente de publication (elles
 * seraient publiées en même temps) ; frise déjà remplie, sauf `replace`. `root` : dossier du site (fichiers des logos).
 */
export async function installLogoTimeline(
  payload: Payload,
  { root, confirm, replace = false }: { root: string; confirm: boolean; replace?: boolean },
): Promise<LogoTimelineReport> {
  const page = (await payload.find({ collection: 'pages', where: { slug: { equals: LOGO_PAGE } }, draft: true, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!page) return { status: 'no-page' }
  // dernière version : un brouillon si des modifications attendent (ou si la page n'a jamais été publiée)
  if (page._status !== 'published') return { status: 'pending-changes' }
  const replaced = page.timeline?.steps?.length ?? 0
  if (replaced && !replace) return { status: 'already-filled', steps: replaced }

  const media: { key: string; existing: boolean }[] = []
  const ids = new Map<string, number>()
  for (const { media: key } of LOGO_TIMELINE.steps) {
    const found = await findLogo(payload, key)
    media.push({ key, existing: Boolean(found) })
    if (found) ids.set(key, found.id)
    else if (confirm) {
      const def = MEDIA.find((m) => m.key === key)
      if (!def) throw new Error(`Logo inconnu : ${key}`)
      const doc = await payload.create({
        collection: 'media',
        data: { alt: def.alt, credit: def.credit },
        filePath: path.join(root, def.file),
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
      ids.set(key, doc.id)
    }
  }
  if (!confirm) return { status: 'ready', media, replaced }

  const mediaId = (key: string) => {
    const id = ids.get(key)
    if (id === undefined) throw new Error(`Logo absent de la médiathèque : ${key}`)
    return id
  }
  await payload.update({ collection: 'pages', id: page.id, data: { _status: 'published', timeline: logoTimelineData(mediaId) }, depth: 0, overrideAccess: true })
  return { status: 'done', media, replaced }
}
