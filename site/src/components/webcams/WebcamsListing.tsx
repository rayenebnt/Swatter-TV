import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AdSlot } from '@/components/layout/AdSlot'
import { DeptFilter } from '@/components/ui/DeptFilter'
import { Icon } from '@/components/ui/Icon'
import { PageHeader, type Crumb } from '@/components/ui/PageHeader'
import { SectionHead } from '@/components/ui/SectionHead'
import { DEPARTMENTS, WEBCAMS_PLUS, webcamZoneLabel, type WebcamZone } from '@/lib/departments'
import { ogImage } from '@/lib/og'
import { inPlace } from '@/lib/places'
import { getActiveWebcams } from '@/lib/queries/webcams'
import { SITE_NAME } from '@/lib/site'
import { CamsGrid } from './CamsGrid'
import { toWebcamView } from './utils'
import { WebcamTile, type WebcamView } from './WebcamTile'
import '@/styles/webcams.css'

/** Adresse de la page Webcams de toute la région, d'un département ou de « Web Cams + » (hors région). */
export const webcamsHref = (zone: WebcamZone | null) => (zone ? `/webcams/${zone}` : '/webcams')

const PLUS_DESCRIPTION = 'Au-delà de la région : les webcams de nos voisins, en Suisse et dans la Vallée d’Aoste.'

function texts(zone: WebcamZone | null) {
  if (zone === WEBCAMS_PLUS) return { title: 'Web Cams +', description: `${PLUS_DESCRIPTION} En direct sur Swatter TV.` }
  return zone
    ? {
        title: `Webcams ${inPlace(zone)}`,
        description: `Les webcams ${inPlace(zone)} en temps réel : lacs, villes, stations et sommets, en direct sur Swatter TV.`,
      }
    : {
        title: 'Webcams en direct',
        description: 'Les lacs, les villes, les stations et les sommets d’Auvergne-Rhône-Alpes en temps réel : toutes les webcams de Swatter TV, en direct.',
      }
}

export function webcamsMetadata(zone: WebcamZone | null): Metadata {
  const { title, description } = texts(zone)
  const url = webcamsHref(zone)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url, title, description, images: [ogImage(null, '/visuels/t-hiver-b.webp')] },
  }
}

/** Grille des webcams (vide : message). */
function Grid({ webcams, empty }: { webcams: WebcamView[]; empty: ReactNode }) {
  if (!webcams.length) {
    return (
      <div className="empty">
        <Icon name="now" />
        <p>{empty}</p>
      </div>
    )
  }
  return (
    <CamsGrid className="camp-grid">
      {webcams.map((cam, i) => (
        <WebcamTile key={cam.id} cam={cam} index={i} />
      ))}
    </CamsGrid>
  )
}

/**
 * Page Webcams (toute la région, un département ou « Web Cams + ») : filtre, grille des webcams actives. Sur la page de
 * toute la région, les webcams hors région suivent dans leur propre section « Web Cams + ».
 */
export async function WebcamsListing({ zone }: { zone: WebcamZone | null }) {
  const all = await getActiveWebcams()
  const plus = all.filter((w) => w.department === WEBCAMS_PLUS).map(toWebcamView)
  const webcams = (zone ? all.filter((w) => w.department === zone) : all.filter((w) => w.department !== WEBCAMS_PLUS)).map(toWebcamView)
  const { title, description } = texts(zone)
  const crumbs: Crumb[] = zone ? [{ label: 'Webcams', href: '/webcams' }, { label: webcamZoneLabel(zone) }] : [{ label: 'Webcams' }]
  // départements qui ont au moins une webcam active (celui demandé reste proposé, actif), puis « Web Cams + »
  const present = new Set<string>(all.map((w) => w.department))
  const zones = [...DEPARTMENTS.map((d) => d.value), WEBCAMS_PLUS].filter((z): z is WebcamZone => present.has(z) || z === zone)

  return (
    <>
      <PageHeader eyebrow="En temps réel" title={title} description={description} crumbs={crumbs} />
      <div className="container">
        <DeptFilter
          label="Les webcams par département"
          className="cams-depts"
          links={[
            { href: '/webcams', label: 'Toute la région', current: !zone },
            ...zones.map((z) => ({ href: webcamsHref(z), label: webcamZoneLabel(z), current: z === zone })),
          ]}
        />
      </div>

      <section className="section section--tight container" aria-label={zone ? title : 'Toutes les webcams de la région'}>
        <Grid
          webcams={webcams}
          empty={
            <>
              <b>{zone ? `Aucune webcam ${zone === WEBCAMS_PLUS ? 'hors région' : inPlace(zone)} pour le moment` : 'Aucune webcam disponible pour le moment'}</b>
              {zone ? (
                <>
                  Découvrez <Link href="/webcams">les webcams de toute la région</Link>.
                </>
              ) : (
                'Les webcams de la chaîne seront bientôt de retour.'
              )}
            </>
          }
        />
      </section>

      {!zone && plus.length > 0 && (
        <section className="section section--tight container" aria-labelledby="web-cams-plus">
          <SectionHead title="Web Cams +" titleId="web-cams-plus" subtitle={PLUS_DESCRIPTION} />
          <Grid webcams={plus} empty={null} />
        </section>
      )}

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>
    </>
  )
}
