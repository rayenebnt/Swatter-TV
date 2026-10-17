import type { Metadata } from 'next'
import Link from 'next/link'
import { AdSlot } from '@/components/layout/AdSlot'
import { getMeteo } from '@/components/meteo/data'
import { MeteoWidget } from '@/components/meteo/MeteoWidget'
import { JsonLd } from '@/components/ui/JsonLd'
import { PageHeader } from '@/components/ui/PageHeader'
import { METEO_CITIES } from '@/lib/meteo'
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/site'

// Page régénérée au plus toutes les 60 s (et après chaque import des prévisions).
export const revalidate = 60

const TITLE = 'La météo en Haute-Savoie et en Auvergne-Rhône-Alpes'
const DESCRIPTION =
  'Prévisions météo à cinq jours pour Annecy, Chamonix, Chambéry, Thonon-les-Bains, Lyon et Grenoble : températures heure par heure, tendances du matin au soir et bulletin du jour.'
const SHARE_IMAGE = '/visuels/t-nuages-a.webp'

// Le global « meteo » n'a pas de champs SEO : titre, description et visuel de partage fixes.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/meteo' },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url: '/meteo',
      title: `${TITLE} — ${SITE_NAME}`,
      description: DESCRIPTION,
      images: [{ url: absoluteUrl(SHARE_IMAGE), width: 960, height: 540, alt: 'Ciel nuageux au-dessus des montagnes' }],
    },
  }
}

/** Page Météo : prévisions détaillées (version large du widget) et présentation de la rubrique. */
export default async function MeteoPage() {
  const data = await getMeteo()

  return (
    <>
      <PageHeader
        eyebrow="Prévisions à 5 jours"
        title="La Météo"
        description="Le temps qu’il fera en Haute-Savoie, en Savoie et dans toute la région Auvergne-Rhône-Alpes, des rives du Léman au massif du Mont-Blanc."
        crumbs={[{ label: 'La Météo' }]}
      />

      <div className="container section--tight">
        <MeteoWidget variant="full" />
      </div>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      <section className="container section meteo-seo" aria-labelledby="meteo-seo-title">
        <div className="prose">
          <h2 id="meteo-seo-title">La météo des Pays de Savoie et de toute la région</h2>
          <p>
            Lac d’Annecy, vallée de l’Arve, massif du Mont-Blanc, Chablais ou bassin chambérien&nbsp;: Swatter TV vous donne chaque jour
            le temps qu’il fera en Haute-Savoie et en Savoie, mais aussi à Lyon et à Grenoble. Les prévisions couvrent cinq jours, avec
            l’évolution des températures heure par heure, la tendance du matin, de l’après-midi et de la soirée, et les minimales et
            maximales des grandes villes d’Auvergne-Rhône-Alpes.
          </p>
          <p>
            Actualisées automatiquement tout au long de la journée et accompagnées d’un bulletin détaillé, elles vous aident à préparer
            une sortie en montagne, un trajet ou un week-end. Avant de partir, jetez aussi un œil aux images en direct de nos{' '}
            <Link href="/webcams">webcams</Link>, et retrouvez la météo à l’antenne sur <Link href="/direct">le direct de Swatter TV</Link>.
          </p>
        </div>
      </section>

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: TITLE,
          description: DESCRIPTION,
          url: absoluteUrl('/meteo'),
          inLanguage: 'fr-FR',
          ...(data?.updatedAt ? { dateModified: data.updatedAt } : {}),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
          about: METEO_CITIES.map((c) => ({
            '@type': 'City',
            name: c.name,
            geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude },
          })),
        }}
      />
    </>
  )
}
