import Image from 'next/image'
import type { CSSProperties } from 'react'
import { DEFAULT_TIMELINE_TITLE, timelineSteps } from '@/lib/timeline'
import type { Page } from '@/payload-types'

/**
 * Frise chronologique d'une page, sous son texte (« Le groupe » : l'évolution du logo) : étapes de la plus ancienne à
 * la plus récente (image, date, titre, texte), reliées par un trait doré, la plus récente mise en avant. Sur une ligne
 * quand la colonne est assez large (les étapes se partagent la place, sans défilement), en colonne sur téléphone.
 * Rien sans étape affichable. `data-preview` : l'aperçu de l'administration y défile quand on modifie la frise.
 */
export function Timeline({ timeline }: { timeline: Page['timeline'] }) {
  const steps = timelineSteps(timeline)
  if (!steps.length) return null
  const intro = timeline?.intro?.trim()
  return (
    <section className="frise" aria-labelledby="frise-title" data-preview="frise">
      <h2 id="frise-title" className="frise__heading">
        {timeline?.title?.trim() || DEFAULT_TIMELINE_TITLE}
      </h2>
      {intro && <p className="frise__intro">{intro}</p>}
      <ol className="frise__list" style={{ '--n': steps.length } as CSSProperties}>
        {steps.map((step) => (
          <li key={step.key} className="frise__step">
            <span className="frise__dot" aria-hidden="true" />
            <div className="frise__img">
              <Image src={step.image.src} alt={step.image.alt} width={step.image.width} height={step.image.height} sizes="(max-width: 640px) 96px, 160px" />
            </div>
            <div className="frise__body">
              {step.date && <p className="frise__date">{step.date}</p>}
              <h3 className="frise__title">{step.title}</h3>
              {step.text && <p className="frise__text">{step.text}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
