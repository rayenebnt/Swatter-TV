'use client'
// Vidéo de fond d'une diapositive du carrousel (HeroImage) : courte boucle muette posée exactement sur la photo (même
// position, même taille, même cadrage), qui apparaît en fondu dès qu'elle tourne ; la photo reste dessous pendant le
// chargement et la remplace quand la vidéo ne peut pas tourner (« réduire les animations », économie de données, aperçus
// arrêtés depuis le pied de page, onglet masqué, carrousel hors de l'écran, fichier illisible). Elle ne tourne que sur la
// diapositive affichée (SlideActive) et n'est demandée qu'à ce moment-là. Sur téléphone, une image pour téléphone de la
// diapositive l'emporte (`phone` false : aucune vidéo sous 760 px). Purement décorative : masquée aux lecteurs d'écran,
// hors du parcours clavier.
import { useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { MOBILE_MEDIA } from '@/components/ui/MediaImage'
import { usePreviewsAllowed } from '@/components/video/motion'
import { bindBackgroundVideo } from '@/components/video/VideoPreview'
import type { HeroVideoSource } from './heroMedia'
import { SlideActive } from './slideState'

const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_MEDIA)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const isMobile = () => window.matchMedia(MOBILE_MEDIA).matches
const serverFalse = () => false

/** Recopie la boîte de la photo (`img`) sur la vidéo : mêmes position et taille, dans tous les modes du carrousel. */
function follow(img: HTMLElement, video: HTMLElement) {
  const copy = () => {
    video.style.left = `${img.offsetLeft}px`
    video.style.top = `${img.offsetTop}px`
    video.style.width = `${img.offsetWidth}px`
    video.style.height = `${img.offsetHeight}px`
  }
  copy()
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(copy)
  ro?.observe(img)
  window.addEventListener('resize', copy, { passive: true })
  return () => {
    ro?.disconnect()
    window.removeEventListener('resize', copy)
  }
}

/**
 * `sources` : par ordre de préférence (version légère MP4 H.264, puis fichier d'origine déjà léger) ; la première que le
 * navigateur sait lire est demandée ; aucune : l'image reste.
 */
export function HeroVideo({ sources, phone, style }: { sources: HeroVideoSource[]; phone: boolean; style?: CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null)
  const active = useContext(SlideActive)
  const allowed = usePreviewsAllowed()
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, serverFalse)
  const [state, setState] = useState<boolean | 'error'>(false)
  const blocked = (!phone && mobile) || state === 'error'

  // boîte de la photo recopiée (la photo entière des téléphones et tablettes est placée par la mise en page)
  useEffect(() => {
    const el = ref.current
    const img = el?.parentElement?.querySelector<HTMLElement>('img.slide__photo')
    if (!el || !img) return
    return follow(img, el)
  }, [])

  // lecture : diapositive affichée seulement (le pilote décide ensuite : écran, préférences, onglet)
  // sources comparées par leur contenu (pas de nouvelle inscription si le carrousel se redessine)
  const list = JSON.stringify(sources)
  useEffect(() => {
    const el = ref.current
    if (!el || !active || blocked) return
    const playable = (JSON.parse(list) as HeroVideoSource[]).find((s) => el.canPlayType(s.type) !== '')
    if (!playable) {
      setState('error')
      return
    }
    return bindBackgroundVideo(el, playable.src, setState) ?? undefined
  }, [active, blocked, list])

  const on = state === true && allowed && !blocked
  return (
    <video
      ref={ref}
      className={on ? 'slide__video is-on' : 'slide__video'}
      style={style}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden
      tabIndex={-1}
    />
  )
}
