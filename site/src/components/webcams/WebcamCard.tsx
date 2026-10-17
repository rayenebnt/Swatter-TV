import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { WebcamItem } from '@/lib/queries/webcams'
import { webcamUrl } from '@/lib/urls'
import { LiveClock } from './LiveClock'
import { panDuration, toWebcamView } from './utils'
import '@/styles/webcams.css'

const SIZES = '(max-width: 1100px) 48vw, 340px'

/** Carte webcam de la maquette : vignette en panoramique lent, pastille « En direct », horloge, lieu ; mène à la page Webcams. */
export function WebcamCard({ webcam, index }: { webcam: WebcamItem; index: number }) {
  const cam = toWebcamView(webcam)
  return (
    <article className="card cam" data-reveal style={{ '--d': index } as CSSProperties}>
      <div className="media" style={{ '--pd': panDuration(index) } as CSSProperties}>
        <Image src={cam.poster.src} alt="" fill sizes={SIZES} unoptimized={/^https?:\/\//.test(cam.poster.src)} />
      </div>
      <div className="cam__top" aria-hidden="true">
        <span className="badge badge--live">
          <i />
          <span className="cam__en">En </span>direct
        </span>
        <span className="cam__clock">
          <LiveClock />
          {cam.temperature && <span className="cam__temp"> · {cam.temperature}</span>}
        </span>
      </div>
      <div className="cam__info">
        <h3>
          <Link className="stretched" href={webcamUrl(cam)}>
            {cam.name}
            {cam.temperature && <span className="sr-only">, {cam.temperature}</span>}
          </Link>
        </h3>
        {cam.place && <span>{cam.place}</span>}
      </div>
      <span className="cam__fs" aria-hidden="true">
        <Icon name="expand" />
      </span>
    </article>
  )
}
