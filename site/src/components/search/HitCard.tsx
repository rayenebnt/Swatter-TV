import Image from 'next/image'
import Link from 'next/link'
import { VideoPreview } from '@/components/video/VideoPreview'
import type { SearchHit } from '@/lib/search'
import { highlightParts } from './text'
import { fallbackVisual, isRemote } from './visuals'

/** Résultat de la page /recherche : vignette (aperçu animé des vidéos et replays), type, titre (mots trouvés surlignés) et contexte ; carte entièrement cliquable. */
export function HitCard({ hit, words }: { hit: SearchHit; words: string[] }) {
  const src = hit.image || fallbackVisual(hit.href)
  return (
    <article className="card hit">
      <div className="media hit__media">
        <Image src={src} alt="" fill sizes="(max-width: 760px) 120px, 176px" unoptimized={isRemote(src)} />
        {/* vignette étroite : aperçu au survol ou au focus clavier seulement (pas de lancement seul sur téléphone) */}
        {hit.preview && <VideoPreview src={hit.preview} kind="hover" />}
      </div>
      <div className="hit__body">
        <p className="kicker">{hit.typeLabel}</p>
        <h3 className="hit__title">
          <Link className="stretched" href={hit.href}>
            {highlightParts(hit.title, words).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}
          </Link>
        </h3>
        {hit.subtitle && <p className="hit__meta">{hit.subtitle}</p>}
      </div>
    </article>
  )
}
