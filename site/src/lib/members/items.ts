// Espace membres : contenus de l'historique et de « Ma liste » (vidéos, replays, articles, événements), prêts à afficher.
import type { Payload, Where } from 'payload'
import { fallbackVisual } from '@/components/video/utils'
import { departmentLabel } from '@/lib/departments'
import { formatDate } from '@/lib/format'
import { mediaUrl, type MediaRef } from '@/lib/media'
import { articleUrl, eventUrl, replayUrl, videoUrl } from '@/lib/urls'
import { previewUrl } from '@/lib/video'
import { KIND_LABELS, type FavoriteKind } from './shared'

/** Contenu tel qu'affiché dans l'espace membres (valeurs simples, transmissibles aux composants client). */
export type MemberItem = {
  kind: FavoriteKind
  id: number
  title: string
  href: string
  image: string
  /** « Vidéo · 04:05 », « Info · Annecy », « Agenda · 24 oct. 2026 » */
  meta: string
  /** Vidéos et replays : adresse de l'aperçu animé (absente sans aperçu) */
  preview?: string
}

type Ref = { kind: FavoriteKind; itemId: number }

const meta = (kind: FavoriteKind, ...parts: (string | null | undefined)[]) => [KIND_LABELS[kind], ...parts.filter(Boolean)].join(' · ')
const image = (m: MediaRef, id: number) => mediaUrl(m, 'card') ?? fallbackVisual(id)
/** Clé « preview » ajoutée seulement si l'aperçu existe. */
const preview = (m: MediaRef): { preview?: string } => {
  const url = previewUrl(m)
  return url ? { preview: url } : {}
}

/**
 * Charge les contenus de `refs` encore visibles du public (publiés, déjà en ligne), dans l'ordre de `refs` ; ceux qui
 * ont été retirés ou supprimés sont simplement absents. `publicOnly: false` : tous, pour les statistiques de l'équipe.
 */
export async function loadItems(payload: Payload, refs: Ref[], { publicOnly = true } = {}): Promise<Map<string, MemberItem>> {
  const ids = (kind: FavoriteKind) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.itemId))]
  // sans utilisateur et sans overrideAccess : les règles de lecture publiques s'appliquent (contenus publiés et en ligne)
  const opts = (kind: FavoriteKind) => {
    const list = ids(kind)
    const where: Where = { id: { in: list } }
    return { where, limit: list.length || 1, depth: 1, pagination: false, overrideAccess: !publicOnly } as const
  }
  const out = new Map<string, MemberItem>()
  const add = (item: MemberItem) => out.set(`${item.kind}:${item.id}`, item)

  const [videos, replays, articles, events] = await Promise.all([
    ids('video').length ? payload.find({ collection: 'videos', ...opts('video'), select: { title: true, slug: true, thumbnail: true, preview: true, duration: true } }) : null,
    ids('replay').length ? payload.find({ collection: 'replays', ...opts('replay'), select: { title: true, slug: true, thumbnail: true, preview: true, duration: true, broadcastAt: true } }) : null,
    ids('article').length ? payload.find({ collection: 'articles', ...opts('article'), select: { title: true, slug: true, department: true, city: true, image: true, publishedAt: true } }) : null,
    ids('event').length ? payload.find({ collection: 'events', ...opts('event'), select: { title: true, slug: true, city: true, poster: true, startDate: true } }) : null,
  ])
  for (const v of videos?.docs ?? []) add({ kind: 'video', id: v.id, title: v.title, href: videoUrl(v), image: image(v.thumbnail, v.id), meta: meta('video', v.duration), ...preview(v.preview) })
  for (const r of replays?.docs ?? [])
    add({
      kind: 'replay',
      id: r.id,
      title: r.title,
      href: replayUrl(r),
      image: image(r.thumbnail, r.id),
      meta: meta('replay', r.duration, r.broadcastAt ? formatDate(r.broadcastAt) : null),
      ...preview(r.preview),
    })
  for (const a of articles?.docs ?? [])
    add({ kind: 'article', id: a.id, title: a.title, href: articleUrl(a), image: image(a.image, a.id), meta: meta('article', a.city || departmentLabel(a.department)) })
  for (const e of events?.docs ?? [])
    add({ kind: 'event', id: e.id, title: e.title, href: eventUrl(e), image: image(e.poster, e.id), meta: meta('event', e.startDate ? formatDate(e.startDate) : null, e.city) })
  return out
}

/** Le contenu existe-t-il et est-il visible du public ? (avant de l'ajouter à l'historique ou à « Ma liste ») */
export async function isPublicItem(payload: Payload, kind: FavoriteKind, id: number): Promise<boolean> {
  return (await loadItems(payload, [{ kind, itemId: id }])).has(`${kind}:${id}`)
}
