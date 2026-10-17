import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { SectionHead } from '@/components/ui/SectionHead'
import { getActiveWebcams } from '@/lib/queries/webcams'
import { CamsGrid } from './CamsGrid'
import { WebcamCard } from './WebcamCard'
import '@/styles/webcams.css'

/** Section « Webcams en direct » : webcams actives (dans l'ordre choisi) ; lien vers la page Webcams si `limit` est fourni. Masquée sans webcam. */
export async function WebcamsSection({ limit }: { limit?: number }) {
  const webcams = await getActiveWebcams(limit)
  if (!webcams.length) return null
  return (
    <section className="section container" id="webcams" aria-labelledby="cams-title">
      <SectionHead eyebrow="En temps réel" title="Webcams en direct" titleId="cams-title">
        {limit !== undefined && (
          <Link className="link-more" href="/webcams">
            Toutes les webcams <Icon name="arrow" />
          </Link>
        )}
      </SectionHead>
      <CamsGrid className="cams">
        {webcams.map((w, i) => (
          <WebcamCard key={w.id} webcam={w} index={i} />
        ))}
      </CamsGrid>
    </section>
  )
}
