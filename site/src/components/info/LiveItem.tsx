import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ArticleImage } from './ArticleImage'
import type { ArticleTeaser } from './utils'

/**
 * Élément du fil « En continu » (maquette : .live-item) : heure sur la frise dorée, accroche, titre, vignette.
 * Composant d'affichage pur (section de l'accueil côté client, colonne de la fiche article côté serveur).
 */
export function LiveItem({
  item,
  time,
  as: Title = 'h4',
  className = '',
  style,
}: {
  item: ArticleTeaser
  /** Élément <time> (libellé calculé par l'appelant) */
  time: ReactNode
  as?: 'h3' | 'h4'
  className?: string
  style?: CSSProperties
}) {
  return (
    <Link className={`live-item ${className}`.trim()} href={item.href} style={style}>
      {time}
      <div>
        {item.kicker && <p className="kicker">{item.kicker}</p>}
        <Title className="live-item__title">{item.title}</Title>
      </div>
      {item.thumb && <ArticleImage image={item.thumb} alt="" width={104} height={66} />}
    </Link>
  )
}
