import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { ArticleImage } from './ArticleImage'
import type { ArticleTeaser } from './utils'

/** Largeur d'affichage dans une grille .grid-cards (1 colonne sous 760 px, 2 à 3 jusqu'à 1100 px, 4 au-delà). */
export const CARD_SIZES = '(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 45vw, 320px'

/**
 * Carte d'article (grilles des pages Info et « À lire aussi ») : image, accroche, titre, chapô, date et département.
 * Composant serveur d'affichage pur : la date est le texte calculé côté serveur (« 16 oct. · 16:34 », heure de Paris).
 */
export function ArticleCard({ item, place = true, sizes = CARD_SIZES }: { item: ArticleTeaser; place?: boolean; sizes?: string }) {
  return (
    <article className="card acard">
      <div className="media">{item.image && <ArticleImage image={item.image} sizes={sizes} />}</div>
      <div className="card__body">
        {item.kicker && <p className="kicker">{item.kicker}</p>}
        <h3 className="card__title">
          <Link className="stretched" href={item.href}>
            {item.title}
          </Link>
        </h3>
        {item.excerpt && <p className="acard__excerpt">{item.excerpt}</p>}
        <div className="card__meta">
          <span>
            <Icon name="clock" />
            <time dateTime={item.publishedAt} title={item.full}>
              {item.short}
            </time>
          </span>
          {place && (
            <span>
              <Icon name="pin" />
              {item.departmentLabel}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
