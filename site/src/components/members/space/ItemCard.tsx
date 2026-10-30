// « Mon espace » : cartes d'un contenu de l'historique ou de « Ma liste » (vidéo, replay, article, événement).
// Sans état ni directive : rendues côté serveur (tableau de bord) ou dans les listes client (bouton « Retirer »).
import Image from 'next/image'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/Icon'
import { imageSource } from '@/components/video/utils'
import { VideoPreview } from '@/components/video/VideoPreview'
import { KIND_LABELS, type FavoriteKind } from '@/lib/members/shared'
import type { SpaceEntry } from './types'

/**
 * Largeurs d'affichage : grille de « Ma liste » (cartes de 230 px au moins : 2 colonnes jusqu'à 760 px), grille du
 * tableau de bord (2 colonnes jusqu'à 1100 px, puis 4) et vignettes des lignes de l'historique.
 */
export const SPACE_GRID_SIZES = '(max-width: 760px) 46vw, (max-width: 1100px) 31vw, 300px'
export const SPACE_GRID4_SIZES = '(max-width: 1100px) 46vw, 320px'
const ROW_SIZES = '(max-width: 560px) 120px, 176px'

const KIND_ICONS: Record<FavoriteKind, IconName> = { video: 'play', replay: 'replay', article: 'news', event: 'cal' }
const playable = (kind: FavoriteKind) => kind === 'video' || kind === 'replay'

/** Détails de la mention « Vidéo · 04:05 » sans le type (affiché à part). */
const details = (meta: string) => meta.split(' · ').slice(1).join(' · ')

type Remove = {
  /** Bouton « Retirer » : texte lu par les lecteurs d'écran et infobulle (« Retirer de ma liste ») */
  label: string
  onRemove: () => void
  disabled?: boolean
}

/** Vignette ; vidéo ou replay : aperçu animé, en boucle tant que la vignette est visible. */
function Thumb({ entry, sizes }: { entry: SpaceEntry; sizes: string }) {
  const { src, unoptimized } = imageSource(entry.item.image)
  const preview = playable(entry.item.kind) ? entry.item.preview : undefined
  return (
    <div className="media">
      <Image src={src} alt="" fill sizes={sizes} unoptimized={unoptimized} />
      {preview && <VideoPreview src={preview} />}
      {playable(entry.item.kind) && (
        <span className="play" aria-hidden="true">
          <Icon name="play" />
        </span>
      )}
    </div>
  )
}

function RemoveButton({ entry, remove, className }: { entry: SpaceEntry; remove: Remove; className: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} onClick={remove.onRemove} disabled={remove.disabled} title={remove.label} data-remove>
      <Icon name="x" />
      <span className="sr-only">
        {remove.label}&nbsp;: {entry.item.title}
      </span>
    </button>
  )
}

/** Carte verticale (grilles du tableau de bord et de « Ma liste »). */
export function SpaceCard({ entry, remove, sizes = SPACE_GRID_SIZES }: { entry: SpaceEntry; remove?: Remove; sizes?: string }) {
  const { item } = entry
  const more = details(item.meta)
  return (
    <article className="card space-card" data-kind={item.kind}>
      <Thumb entry={entry} sizes={sizes} />
      <div className="card__body">
        <p className="kicker space-kind">
          <Icon name={KIND_ICONS[item.kind]} />
          {KIND_LABELS[item.kind]}
        </p>
        <h3 className="card__title">
          <Link className="stretched" href={item.href}>
            {item.title}
          </Link>
        </h3>
        <div className="card__meta">
          {more && <span>{more}</span>}
          <span>
            <Icon name="clock" />
            <time dateTime={entry.at}>{entry.note}</time>
          </span>
        </div>
      </div>
      {remove && <RemoveButton entry={entry} remove={remove} className="space-card__remove" />}
    </article>
  )
}

/** Ligne de l'historique : vignette, type et détails, titre, heure de visionnage, bouton « Retirer ». */
export function SpaceRow({ entry, remove }: { entry: SpaceEntry; remove?: Remove }) {
  const { item } = entry
  return (
    <article className="card space-row" data-kind={item.kind}>
      <Thumb entry={entry} sizes={ROW_SIZES} />
      <div className="space-row__body">
        <p className="kicker space-kind">
          <Icon name={KIND_ICONS[item.kind]} />
          {item.meta}
        </p>
        <p className="space-row__title">
          <Link className="stretched" href={item.href}>
            {item.title}
          </Link>
        </p>
        <p className="space-row__note">
          <Icon name="clock" />
          <time dateTime={entry.at}>{entry.note}</time>
        </p>
      </div>
      {remove && <RemoveButton entry={entry} remove={remove} className="space-row__remove" />}
    </article>
  )
}
