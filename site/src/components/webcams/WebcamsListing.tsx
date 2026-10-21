import type { Metadata } from 'next'
import Link from 'next/link'
import { AdSlot } from '@/components/layout/AdSlot'
import { DeptFilter } from '@/components/ui/DeptFilter'
import { Icon } from '@/components/ui/Icon'
import { PageHeader, type Crumb } from '@/components/ui/PageHeader'
import { DEPARTMENTS, departmentLabel, type DepartmentSlug } from '@/lib/departments'
import { ogImage } from '@/lib/og'
import { inPlace } from '@/lib/places'
import { getActiveWebcams } from '@/lib/queries/webcams'
import { SITE_NAME } from '@/lib/site'
import { CamsGrid } from './CamsGrid'
import { toWebcamView } from './utils'
import { WebcamTile } from './WebcamTile'
import '@/styles/webcams.css'

/** Adresse de la page Webcams de toute la région ou d'un département. */
export const webcamsHref = (dept: DepartmentSlug | null) => (dept ? `/webcams/${dept}` : '/webcams')

function texts(dept: DepartmentSlug | null) {
  return dept
    ? {
        title: `Webcams ${inPlace(dept)}`,
        description: `Les webcams ${inPlace(dept)} en temps réel : lacs, villes, stations et sommets, en direct sur Swatter TV.`,
      }
    : {
        title: 'Webcams en direct',
        description: 'Les lacs, les villes, les stations et les sommets d’Auvergne-Rhône-Alpes en temps réel : toutes les webcams de Swatter TV, en direct.',
      }
}

export function webcamsMetadata(dept: DepartmentSlug | null): Metadata {
  const { title, description } = texts(dept)
  const url = webcamsHref(dept)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url, title, description, images: [ogImage(null, '/visuels/t-hiver-b.webp')] },
  }
}

/** Page Webcams (toute la région ou un département) : filtre par département, grille des webcams actives. */
export async function WebcamsListing({ dept }: { dept: DepartmentSlug | null }) {
  const all = await getActiveWebcams()
  const shown = dept ? all.filter((w) => w.department === dept) : all
  const webcams = shown.map(toWebcamView)
  const { title, description } = texts(dept)
  const crumbs: Crumb[] = dept ? [{ label: 'Webcams', href: '/webcams' }, { label: departmentLabel(dept) }] : [{ label: 'Webcams' }]
  // départements qui ont au moins une webcam active (le département demandé reste proposé, actif)
  const present = new Set(all.map((w) => w.department))
  const departments = DEPARTMENTS.map((d) => d.value).filter((d) => present.has(d) || d === dept)

  return (
    <>
      <PageHeader eyebrow="En temps réel" title={title} description={description} crumbs={crumbs} />
      <div className="container">
        <DeptFilter
          label="Les webcams par département"
          className="cams-depts"
          links={[
            { href: '/webcams', label: 'Toute la région', current: !dept },
            ...departments.map((d) => ({ href: webcamsHref(d), label: departmentLabel(d), current: d === dept })),
          ]}
        />
      </div>

      <section className="section section--tight container" aria-label={dept ? `Les webcams ${inPlace(dept)}` : 'Toutes les webcams'}>
        {webcams.length ? (
          <CamsGrid className="camp-grid">
            {webcams.map((cam, i) => (
              <WebcamTile key={cam.id} cam={cam} index={i} />
            ))}
          </CamsGrid>
        ) : (
          <div className="empty">
            <Icon name="now" />
            <p>
              <b>{dept ? `Aucune webcam ${inPlace(dept)} pour le moment` : 'Aucune webcam disponible pour le moment'}</b>
              {dept ? (
                <>
                  Découvrez <Link href="/webcams">les webcams de toute la région</Link>.
                </>
              ) : (
                'Les webcams de la chaîne seront bientôt de retour.'
              )}
            </p>
          </div>
        )}
      </section>

      <div className="container">
        <AdSlot placement="inner-leaderboard" />
      </div>
    </>
  )
}
