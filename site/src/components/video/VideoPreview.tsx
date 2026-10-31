'use client'
// Aperçu animé d'une vidéo : court extrait muet servi par le site (aucun lecteur tiers, donc aucun consentement requis),
// superposé à l'image d'une carte ou placé derrière le bouton de lecture d'une fiche. Il tourne seul, en boucle, tant
// qu'il est visible, sans survol ni toucher ; hors de l'écran, il est mis en pause. Le fichier n'est demandé qu'à la
// première apparition (preload="none", src posée à ce moment-là). Le choix des aperçus qui tournent revient au pilote
// unique de la page (preview-director.ts) : plafond d'aperçus lus en même temps, jamais en « réduire les animations »,
// en économie de données ni dans un onglet masqué.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { autoplayAllowed, deviceMemory, onAutoplayPrefsChange, SMALL_SCREEN } from './motion'
import { CARD_RATIO, PreviewDirector, previewLimit, screenDistance, VISIBLE_RATIO, type SlotKind } from './preview-director'
import '@/styles/video.css'

type Runtime = { director: PreviewDirector; observe: (el: Element, id: number) => () => void }

let runtime: Runtime | null = null

/** Pilote de la page, créé au premier aperçu affiché, avec ses écouteurs (un seul IntersectionObserver pour tous). */
function getRuntime(): Runtime {
  if (runtime) return runtime
  const small = window.matchMedia(SMALL_SCREEN)
  const limit = () => previewLimit(small.matches, deviceMemory())
  const director = new PreviewDirector({ allowed: autoplayAllowed(), hidden: document.hidden, limit: limit() })
  const ids = new Map<Element, number>()
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = ids.get(entry.target)
        if (id !== undefined) director.visibility(id, entry.isIntersecting ? entry.intersectionRatio : 0)
      }
    },
    { threshold: [0, CARD_RATIO, VISIBLE_RATIO] },
  )
  onAutoplayPrefsChange(() => director.setEnv({ allowed: autoplayAllowed() }))
  small.addEventListener('change', () => director.setEnv({ limit: limit() }))
  document.addEventListener('visibilitychange', () => director.setEnv({ hidden: document.hidden }))
  // défilement de la page et des rails (capture : l'événement scroll d'un élément ne remonte pas jusqu'au document) ;
  // il ne compte que lorsque le plafond est atteint (les aperçus les plus proches du centre changent)
  const moved = () => director.scrolled()
  document.addEventListener('scroll', moved, { capture: true, passive: true })
  window.addEventListener('resize', moved, { passive: true })
  runtime = {
    director,
    observe: (el, id) => {
      ids.set(el, id)
      io.observe(el)
      return () => {
        io.unobserve(el)
        ids.delete(el)
      }
    },
  }
  return runtime
}

/**
 * Inscrit l'élément vidéo auprès du pilote. `onState` : l'aperçu tourne (true) ou est revenu à l'image (false).
 * Renvoie l'identifiant et la fonction de nettoyage.
 */
function bindPreview(el: HTMLVideoElement, src: string, kind: SlotKind, onState?: (on: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return null
  const { director, observe } = getRuntime()
  const id = director.register({
    kind,
    play: () => {
      el.muted = true
      // fichier demandé à la première apparition seulement ; ensuite, l'extrait reprend là où il s'était arrêté
      if (!el.getAttribute('src')) el.src = src
      // rejet silencieux : format non décodé (H.264 dans le Chromium des tests), économie d'énergie d'iOS…
      el.play().catch(() => {})
    },
    stop: () => {
      el.pause()
      el.classList.remove('is-on')
      onState?.(false)
    },
    distance: () => screenDistance(el.getBoundingClientRect(), window.innerWidth, window.innerHeight),
  })
  const unobserve = observe(el, id)

  // apparition en fondu quand l'image bouge vraiment (pas pendant le chargement)
  const onPlaying = () => {
    if (!director.isPlaying(id)) return el.pause()
    el.classList.add('is-on')
    onState?.(true)
  }
  // fichier illisible ou introuvable : l'image reste, l'aperçu n'est plus proposé (sa place revient à un autre)
  const onError = () => {
    el.classList.remove('is-on')
    onState?.(false)
    unobserve()
    director.unregister(id)
  }
  el.addEventListener('playing', onPlaying)
  el.addEventListener('error', onError)

  const cleanup = () => {
    el.removeEventListener('playing', onPlaying)
    el.removeEventListener('error', onError)
    unobserve()
    director.unregister(id)
    el.pause()
  }
  return { id, cleanup }
}

/**
 * Aperçu d'une carte ou d'une tuile (vidéo, replay, Top 10, « Vidéo du jour », espace membres, recherche), placé juste
 * après son image. Purement décoratif : masqué aux lecteurs d'écran, hors du parcours clavier, il laisse passer les
 * clics vers le lien de la carte.
 */
export function VideoPreview({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return bindPreview(el, src, 'card')?.cleanup
  }, [src])
  return <video ref={ref} className="vprev" muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback aria-hidden tabIndex={-1} />
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5h2.6v13H8zM13.4 5.5H16v13h-2.6z" fill="currentColor" />
    </svg>
  )
}

/**
 * Aperçu derrière le bouton de lecture d'une fiche : en boucle tant que le lecteur est visible, avec un petit bouton
 * pour l'arrêter ou le relancer (WCAG 2.2.2), affiché seulement quand l'aperçu tourne ou a été mis en pause.
 */
export function PlayerPreview({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const slot = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const bound = bindPreview(el, src, 'ambient', setPlaying)
    slot.current = bound?.id ?? null
    return () => {
      bound?.cleanup()
      slot.current = null
    }
  }, [src])

  const toggle = () => {
    if (slot.current === null || !runtime) return
    const next = !paused
    setPaused(next)
    runtime.director.setPaused(slot.current, next)
    // relance acceptée : le bouton reste en place (et garde le focus) sans attendre l'événement « playing »
    if (!next && runtime.director.isPlaying(slot.current)) setPlaying(true)
  }
  const label = paused ? 'Relancer l’aperçu' : 'Mettre l’aperçu en pause'

  return (
    <>
      <video ref={ref} className="vprev vp__preview" muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback aria-hidden tabIndex={-1} />
      {(playing || paused) && (
        <button type="button" className="vp__ptoggle" onClick={toggle} aria-label={label} title={label}>
          {paused ? <Icon name="play" /> : <PauseIcon />}
        </button>
      )}
    </>
  )
}
