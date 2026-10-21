import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { SectionHead } from '@/components/ui/SectionHead'
import { getActiveWebcams } from '@/lib/queries/webcams'
import { CamsGrid } from './CamsGrid'
import { isComingSoon } from './utils'
import { WebcamCard } from './WebcamCard'
import '@/styles/webcams.css'

/**
 * Section « Webcams en direct » : webcams actives, celles qui sont déjà en direct d'abord (puis dans l'ordre choisi) ; lien
 * vers la page Webcams si `limit` est fourni. Masquée sans webcam.
 */
export async function WebcamsSection({ limit }: { limit?: number }) {
  const all = await getActiveWebcams()
  const webcams = [...all.filter((w) => !isComingSoon(w)), ...all.filter(isComingSoon)].slice(0, limit ?? all.length)
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
