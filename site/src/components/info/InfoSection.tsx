import Link from 'next/link'
import { MeteoWidget } from '@/components/meteo/MeteoWidget'
import { Icon } from '@/components/ui/Icon'
import { SectionHead } from '@/components/ui/SectionHead'
import { getLatestArticles } from '@/lib/queries/articles'
import { getInfoOfDay } from '@/lib/queries/home'
import { InfoFeed } from './InfoFeed'
import { feedTeasers } from './utils'
import '@/styles/info.css'

/** Articles envoyés au client (filtres par département sans nouvelle requête). */
const COUNT = 30

/**
 * Section « L'Info » de l'accueil (maquette : #info) : filtres par département, article principal,
 * fil « En continu » et météo en colonne. L'info du jour, déjà affichée dans « À la une », n'y est pas reprise.
 */
export async function InfoSection() {
  const [une, latest] = await Promise.all([getInfoOfDay(), getLatestArticles(COUNT + 1)])
  const articles = latest.filter((a) => a.id !== une?.id).slice(0, COUNT)

  // grande image (image d'origine) et chapô pour les seuls articles qui peuvent devenir l'article principal
  const items = feedTeasers(articles)

  return (
    <section className="section container" id="info" aria-labelledby="info-title">
      <SectionHead eyebrow="7j/7 · 24h/24" title="L’Info en Auvergne-Rhône-Alpes" titleId="info-title" subtitle="Le flux d’actualité de toute la région, département par département.">
        <Link className="link-more" href="/info">
          Toute l’info <Icon name="arrow" />
        </Link>
      </SectionHead>
      <div className="info-grid">
        <InfoFeed items={items} />
        <MeteoWidget variant="aside" />
      </div>
    </section>
  )
}
