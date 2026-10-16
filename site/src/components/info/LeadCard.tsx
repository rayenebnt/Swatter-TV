import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ArticleImage } from './ArticleImage'
import type { ArticleTeaser } from './utils'

/** Largeur d'affichage de l'image (2 colonnes au-delà de 760 px, colonne de l'info à côté de la météo au-delà de 1100 px). */
export const LEAD_SIZES = '(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 50vw, 440px'

/**
 * Article principal (maquette : .card.lead) : grande image, accroche, titre, chapô, date et département.
 * Composant d'affichage pur, utilisé par la section de l'accueil (client) et les pages Info (serveur).
 */
export function LeadCard({
  item,
  time,
  as: Title = 'h3',
  sizes = LEAD_SIZES,
  priority = false,
  reveal = false,
  className = '',
  style,
}: {
  item: ArticleTeaser
  /** Élément <time> (libellé calculé par l'appelant) */
  time: ReactNode
  as?: 'h2' | 'h3'
  sizes?: string
  priority?: boolean
  reveal?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <article className={`card lead ${className}`.trim()} data-reveal={reveal ? '' : undefined} style={style}>
      <div className="media">
        {item.image && <ArticleImage image={item.image} sizes={sizes} priority={priority} />}
        <span className="badge badge--live" aria-hidden="true">
          <i />
          Info
        </span>
      </div>
      <div className="card__body">
        {item.kicker && <p className="kicker">{item.kicker}</p>}
        <Title className="card__title">
          <Link className="stretched" href={item.href}>
            {item.title}
          </Link>
        </Title>
        {item.excerpt && <p className="lead__excerpt">{item.excerpt}</p>}
        <div className="card__meta">
          <span>
            <Icon name="clock" />
            {time}
          </span>
          <span>
            <Icon name="pin" />
            {item.departmentLabel}
          </span>
        </div>
      </div>
    </article>
  )
}
