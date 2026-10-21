import type { Metadata } from 'next'
import Link from 'next/link'
import { AdSlot } from '@/components/layout/AdSlot'
import { DeptFilter } from '@/components/ui/DeptFilter'
import { JsonLd } from '@/components/ui/JsonLd'
import { PageHeader, type Crumb } from '@/components/ui/PageHeader'
import { DEPARTMENTS, departmentLabel, type DepartmentSlug } from '@/lib/departments'
import { METEO_CITIES, METEO_CITY_LIST, meteoCityOf, meteoHref } from '@/lib/meteo'
import { ogImage } from '@/lib/og'
import { inPlace } from '@/lib/places'
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/site'
import { getMeteo } from './data'
import { MeteoWidget } from './MeteoWidget'

const SHARE_IMAGE = '/visuels/t-nuages-a.webp'

function texts(dept: DepartmentSlug | null) {
  if (!dept) {
    return {
      title: 'La météo en Auvergne-Rhône-Alpes',
      lede: 'Le temps qu’il fera dans toute la région Auvergne-Rhône-Alpes, département par département, des Pays de Savoie à l’Auvergne.',
      description: `Prévisions météo à cinq jours en Auvergne-Rhône-Alpes (${METEO_CITY_LIST}) : températures heure par heure, tendances du matin au soir et bulletin du jour.`,
    }
  }
  const city = meteoCityOf(dept).name
  return {
    title: `La météo ${inPlace(dept)}`,
    lede: `Le temps qu’il fera ${inPlace(dept)} : prévisions détaillées à ${city} pour les cinq prochains jours.`,
    description: `Prévisions météo à cinq jours ${inPlace(dept)} (${city}) : températures heure par heure, tendances du matin au soir et bulletin du jour.`,
  }
}

// Le global « meteo » n'a pas de champs SEO : titre, description et visuel de partage fixes.
export function meteoMetadata(dept: DepartmentSlug | null): Metadata {
  const { title, description } = texts(dept)
  const url = meteoHref(dept)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url,
      title: `${title} — ${SITE_NAME}`,
      description,
      images: [ogImage(null, SHARE_IMAGE, 'Ciel nuageux au-dessus des montagnes')],
    },
  }
}

/** Page Météo (toute la région ou un département) : filtre par département, prévisions détaillées, présentation. */
export async function MeteoListing({ dept }: { dept: DepartmentSlug | null }) {
  const data = await getMeteo(dept)
  const { title, lede, description } = texts(dept)
  const crumbs: Crumb[] = dept ? [{ label: 'La Météo', href: '/meteo' }, { label: departmentLabel(dept) }] : [{ label: 'La Météo' }]
  const cities = dept ? [meteoCityOf(dept)] : METEO_CITIES

  return (
    <>
      <PageHeader eyebrow="Prévisions à 5 jours" title={dept ? `La Météo ${inPlace(dept)}` : 'La Météo'} description={lede} crumbs={crumbs} />
      <div className="container">
        <DeptFilter
          label="La météo par département"
          className="meteo-depts"
          links={[
            { href: '/meteo', label: 'Toute la région', current: !dept },
            ...DEPARTMENTS.map((d) => ({ href: meteoHref(d.value), label: d.label, current: d.value === dept })),
          ]}
        />
      </div>

      <div className="container section--tight">
        <MeteoWidget variant="full" dept={dept} />
      </div>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>

      <section className="container section meteo-seo" aria-labelledby="meteo-seo-title">
        <div className="prose">
          <h2 id="meteo-seo-title">{dept ? `La météo ${inPlace(dept)}, jour après jour` : 'La météo de toute la région, département par département'}</h2>
          <p>
            {dept
              ? `Swatter TV vous donne chaque jour le temps qu’il fera ${inPlace(dept)}, avec les prévisions détaillées à ${meteoCityOf(dept).name}. `
              : 'Pays de Savoie, métropole lyonnaise, Isère, Drôme et Ardèche ou Auvergne : Swatter TV vous donne chaque jour le temps qu’il fera partout en Auvergne-Rhône-Alpes. '}
            Les prévisions couvrent cinq jours, avec l’évolution des températures heure par heure, la tendance du matin, de l’après-midi et
            de la soirée{dept ? ', et les minimales et maximales des grandes villes de la région.' : `, et les minimales et maximales à ${METEO_CITY_LIST}.`}
          </p>
          <p>
            Actualisées automatiquement tout au long de la journée et accompagnées d’un bulletin détaillé, elles vous aident à préparer
            une sortie, un trajet ou un week-end. Avant de partir, jetez aussi un œil aux images en direct de nos <Link href="/webcams">webcams</Link>, et
            retrouvez la météo à l’antenne sur <Link href="/direct">le direct de Swatter TV</Link>.
          </p>
        </div>
      </section>

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: absoluteUrl(meteoHref(dept)),
          inLanguage: 'fr-FR',
          ...(data?.updatedAt ? { dateModified: data.updatedAt } : {}),
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
          about: cities.map((c) => ({
            '@type': 'City',
            name: c.name,
            geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude },
          })),
        }}
      />
    </>
  )
}
