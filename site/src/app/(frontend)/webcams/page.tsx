import type { Metadata } from 'next'
import { AdSlot } from '@/components/layout/AdSlot'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { CamsGrid } from '@/components/webcams/CamsGrid'
import { toWebcamView } from '@/components/webcams/utils'
import { WebcamTile } from '@/components/webcams/WebcamTile'
import { getActiveWebcams } from '@/lib/queries/webcams'
import { SITE_NAME } from '@/lib/site'
import '@/styles/webcams.css'
import { ogImage } from '@/lib/og'

export const revalidate = 60

const TITLE = 'Webcams en direct'
const DESCRIPTION = 'Les lacs, les villes, les stations et les sommets d’Auvergne-Rhône-Alpes en temps réel\u00a0: toutes les webcams de Swatter TV, en direct.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/webcams' },
  openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, url: '/webcams', title: TITLE, description: DESCRIPTION, images: [ogImage(null, '/visuels/t-hiver-b.webp')] },
}

export default async function WebcamsPage() {
  const webcams = (await getActiveWebcams()).map(toWebcamView)

  return (
    <>
      <PageHeader eyebrow="En temps réel" title={TITLE} description={DESCRIPTION} crumbs={[{ label: 'Webcams' }]} />

      <section className="section section--tight container" aria-label="Toutes les webcams">
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
              <b>Aucune webcam disponible pour le moment</b>
              Les webcams de la chaîne seront bientôt de retour.
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
