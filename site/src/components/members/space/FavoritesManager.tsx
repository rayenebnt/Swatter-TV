'use client'
// « Mon espace » : grille de « Ma liste » avec filtres par type de contenu et retrait d'un contenu (mise à jour optimiste,
// puis nouvelle lecture des données de la page).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Seg } from '@/components/ui/Seg'
import { FAVORITE_KINDS, type FavoriteKind } from '@/lib/members/shared'
import { SpaceCard } from './ItemCard'
import { SpaceEmpty } from './SpaceBlock'
import type { SpaceEntry } from './types'
import { useSpaceApi } from './useSpaceApi'

type Filter = 'all' | FavoriteKind

/** Libellés des filtres (pluriel de KIND_LABELS). */
const FILTER_LABELS: Record<FavoriteKind, string> = { video: 'Vidéos', replay: 'Replays', article: 'Infos', event: 'Agenda' }

export function FavoritesManager({ entries }: { entries: SpaceEntry[] }) {
  const router = useRouter()
  const call = useSpaceApi()
  const [filter, setFilter] = useState<Filter>('all')
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const [status, setStatus] = useState('')
  const [failure, setFailure] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLUListElement>(null)
  const summary = useRef<HTMLParagraphElement>(null)

  const kept = entries.filter((e) => !removed.has(e.key))
  const counts = new Map<FavoriteKind, number>()
  for (const e of kept) counts.set(e.item.kind, (counts.get(e.item.kind) ?? 0) + 1)
  // filtres des seuls types présents ; un filtre devenu vide revient à « Tout »
  const kinds = FAVORITE_KINDS.filter((k) => counts.has(k))
  const active: Filter = filter !== 'all' && counts.has(filter) ? filter : 'all'
  const shown = active === 'all' ? kept : kept.filter((e) => e.item.kind === active)

  const options = [
    { value: 'all', label: <FilterLabel text="Tout" count={kept.length} /> },
    ...kinds.map((k) => ({ value: k, label: <FilterLabel text={FILTER_LABELS[k]} count={counts.get(k) ?? 0} /> })),
  ]

  const setRemovedKey = (key: string, on: boolean) =>
    setRemoved((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  async function remove(entry: SpaceEntry, index: number) {
    setFailure('')
    setStatus('')
    setRemovedKey(entry.key, true)
    // focus sur le bouton « Retirer » suivant (ou précédent), sinon sur le décompte ; liste vidée : sur le bloc entier
    requestAnimationFrame(() => {
      const buttons = grid.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')
      const target = buttons?.length ? buttons[Math.min(index, buttons.length - 1)] : null
      ;(target ?? summary.current ?? root.current)?.focus()
    })
    const res = await call<{ saved: boolean }>(`/favoris?kind=${encodeURIComponent(entry.item.kind)}&id=${entry.item.id}`, { method: 'DELETE' })
    if (res.ok) {
      setStatus(`« ${entry.item.title} » a été retiré de votre liste.`)
      router.refresh()
    } else if (res.status !== 401) {
      setRemovedKey(entry.key, false)
      setFailure(res.error)
    }
  }

  return (
    <div ref={root} className="space-favorites" tabIndex={-1}>
      <p className="space-status" role="status">
        {status}
      </p>
      {failure && (
        <p className="contact-err contact-err--global" role="alert">
          {failure}
        </p>
      )}

      {kept.length ? (
        <>
          <div className="space-favorites__bar">
            <p ref={summary} tabIndex={-1} className="space-count-line">
              {kept.length} {kept.length > 1 ? 'contenus gardés' : 'contenu gardé'}
            </p>
            {kinds.length > 1 && (
              <Seg className="seg--bleed" ariaLabel="Filtrer ma liste par type" options={options} value={active} onChange={(v) => setFilter(v as Filter)} />
            )}
          </div>
          <ul ref={grid} className="space-grid">
            {shown.map((e, i) => (
              <li key={e.key}>
                <SpaceCard entry={e} remove={{ label: 'Retirer de ma liste', onRemove: () => remove(e, i) }} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <SpaceEmpty icon="bookmark" title="Votre liste est vide">
          <p>
            Sur chaque vidéo, replay, article et événement du site, le bouton{' '}
            <span className="space-chip">
              <Icon name="bookmark" />
              Ajouter à ma liste
            </span>{' '}
            garde le contenu ici pour plus tard. Pour le retirer, appuyez sur «&nbsp;Dans ma liste&nbsp;» ou sur la croix de sa carte.
          </p>
          <p className="space-empty__links">
            <Link href="/videos">Les vidéos</Link>
            <Link href="/replay">Les replays</Link>
            <Link href="/info">L’info</Link>
            <Link href="/agenda">L’agenda</Link>
          </p>
        </SpaceEmpty>
      )}
    </div>
  )
}

function FilterLabel({ text, count }: { text: string; count: number }) {
  return (
    <>
      {text}
      <span className="space-filter-count">
        <span className="sr-only"> (</span>
        {count}
        <span className="sr-only">)</span>
      </span>
    </>
  )
}
