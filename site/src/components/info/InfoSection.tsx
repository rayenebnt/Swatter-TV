import Link from 'next/link'
import { MeteoWidget } from '@/components/meteo/MeteoWidget'
import { Icon } from '@/components/ui/Icon'
import { SectionHead } from '@/components/ui/SectionHead'
import { getLatestArticles } from '@/lib/queries/articles'
import { getInfoOfDay } from '@/lib/queries/home'
import { InfoFeed } from './InfoFeed'
import { toTeaser } from './utils'
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

  // Seuls les articles qui peuvent devenir l'article principal (le premier de chaque département) emportent leur
  // grande image et leur chapô ; le tout premier n'apparaît jamais dans le fil : moins de données envoyées au navigateur.
  const leads = new Set<number>()
  const seen = new Set<string>()
  for (const a of articles) {
    if (!seen.has(a.department)) leads.add(a.id)
    seen.add(a.department)
  }
  const items = articles.map((a, i) => toTeaser(a, { image: leads.has(a.id), excerpt: leads.has(a.id), thumb: i > 0 }))

  return (
    <section className="section container" id="info" aria-labelledby="info-title">
      <SectionHead eyebrow="7j/7 · 24h/24" title="L’Info en Haute-Savoie" titleId="info-title" subtitle="Le flux d’actualité de la Haute-Savoie, commune par commune.">
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
