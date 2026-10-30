'use client'
// Aperçu animé d'une vidéo : court extrait muet servi par le site (aucun lecteur tiers, donc aucun consentement requis),
// superposé à l'image d'une carte ou placé derrière le bouton de lecture d'une fiche. Le fichier n'est demandé qu'au
// premier lancement (preload="none", src posée à ce moment-là). Le choix de l'aperçu qui tourne revient au pilote
// unique de la page (preview-director.ts) : un seul à la fois, jamais en « réduire les animations », en économie de
// données ni dans un onglet masqué.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { autoplayAllowed, FINE_POINTER, onAutoplayPrefsChange } from './motion'
import { PreviewDirector, VISIBLE_RATIO, type SlotKind } from './preview-director'
import '@/styles/video.css'

type Runtime = { director: PreviewDirector; observe: (el: Element, id: number) => () => void }

let runtime: Runtime | null = null

/** Pilote de la page, créé au premier aperçu affiché, avec ses écouteurs (un seul IntersectionObserver pour tous). */
function getRuntime(): Runtime {
  if (runtime) return runtime
  const pointer = window.matchMedia(FINE_POINTER)
  const director = new PreviewDirector({ allowed: autoplayAllowed(), pointer: pointer.matches, hidden: document.hidden })
  const ids = new Map<Element, number>()
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = ids.get(entry.target)
        if (id !== undefined) director.visibility(id, entry.isIntersecting ? entry.intersectionRatio : 0)
      }
    },
    { threshold: [0, VISIBLE_RATIO] },
  )
  onAutoplayPrefsChange(() => director.setEnv({ allowed: autoplayAllowed() }))
  pointer.addEventListener('change', () => director.setEnv({ pointer: pointer.matches }))
  document.addEventListener('visibilitychange', () => director.setEnv({ hidden: document.hidden }))
  // défilement de la page et des rails (capture : l'événement scroll d'un élément ne remonte pas jusqu'au document)
  document.addEventListener('scroll', () => director.scrolled(), { capture: true, passive: true })
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

/** Distance entre le centre d'un élément et celui de la fenêtre. */
function distanceToCenter(el: Element): number {
  const r = el.getBoundingClientRect()
  return Math.hypot(r.left + r.width / 2 - window.innerWidth / 2, r.top + r.height / 2 - window.innerHeight / 2)
}

const isFocusVisible = (target: EventTarget | null) => {
  try {
    return target instanceof Element && target.matches(':focus-visible')
  } catch {
    return false
  }
}

/**
 * Inscrit l'élément vidéo auprès du pilote ; `host` (la carte) reçoit le survol et le focus clavier.
 * `onState` : l'aperçu tourne (true) ou est revenu à l'image (false). Renvoie l'identifiant et la fonction de nettoyage.
 */
function bindPreview(el: HTMLVideoElement, src: string, kind: SlotKind, host: HTMLElement | null, onState?: (on: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return null
  const { director, observe } = getRuntime()
  const id = director.register({
    kind,
    play: (loop) => {
      el.loop = loop
      el.muted = true
      // fichier demandé au premier lancement seulement ; ensuite, l'extrait repart du début
      if (!el.getAttribute('src')) el.src = src
      else if (el.paused) el.currentTime = 0
      // rejet silencieux : format non décodé (H.264 dans le Chromium des tests), économie d'énergie d'iOS…
      el.play().catch(() => {})
    },
    stop: () => {
      el.pause()
      el.classList.remove('is-on')
      onState?.(false)
    },
    distance: () => distanceToCenter(el),
  })
  const unobserve = observe(el, id)

  // apparition en fondu quand l'image bouge vraiment (pas pendant le chargement)
  const onPlaying = () => {
    if (director.current?.id !== id) return el.pause()
    el.classList.add('is-on')
    onState?.(true)
    director.playing(id)
  }
  const onEnded = () => director.ended(id)
  // fichier illisible ou introuvable : l'image reste, l'aperçu n'est plus proposé
  const onError = () => {
    el.classList.remove('is-on')
    onState?.(false)
    unobserve()
    director.unregister(id)
  }
  const onEnter = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') director.pointerEnter(id)
  }
  const onLeave = () => director.pointerLeave(id)
  const onFocusIn = (e: FocusEvent) => {
    if (isFocusVisible(e.target)) director.focusIn(id)
  }
  const onFocusOut = (e: FocusEvent) => {
    if (!(e.relatedTarget instanceof Node && host?.contains(e.relatedTarget))) director.focusOut(id)
  }
  el.addEventListener('playing', onPlaying)
  el.addEventListener('ended', onEnded)
  el.addEventListener('error', onError)
  host?.addEventListener('pointerenter', onEnter)
  host?.addEventListener('pointerleave', onLeave)
  host?.addEventListener('focusin', onFocusIn)
  host?.addEventListener('focusout', onFocusOut)

  const cleanup = () => {
    el.removeEventListener('playing', onPlaying)
    el.removeEventListener('ended', onEnded)
    el.removeEventListener('error', onError)
    host?.removeEventListener('pointerenter', onEnter)
    host?.removeEventListener('pointerleave', onLeave)
    host?.removeEventListener('focusin', onFocusIn)
    host?.removeEventListener('focusout', onFocusOut)
    unobserve()
    director.unregister(id)
    el.pause()
  }
  return { id, cleanup }
}

/**
 * Aperçu d'une carte (vidéo, replay, Top 10, « Vidéo du jour », espace membres, recherche), placé juste après son image.
 * Purement décoratif : masqué aux lecteurs d'écran, hors du parcours clavier, il laisse passer les clics vers le lien
 * de la carte. `kind` : voir SlotKind (« hover » pour les petites vignettes, « feature » pour la grande tuile).
 */
export function VideoPreview({ src, kind = 'card' }: { src: string; kind?: Exclude<SlotKind, 'ambient'> }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // la carte : premier article ou lien qui contient l'image
    const host = el.parentElement?.closest<HTMLElement>('article, a') ?? el.parentElement
    return bindPreview(el, src, kind, host)?.cleanup
  }, [src, kind])
  return <video ref={ref} className="vprev" muted playsInline preload="none" disablePictureInPicture disableRemotePlayback aria-hidden tabIndex={-1} />
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
    const bound = bindPreview(el, src, 'ambient', null, setPlaying)
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
  }
  const label = paused ? 'Relancer l’aperçu' : 'Mettre l’aperçu en pause'

  return (
    <>
      <video ref={ref} className="vprev vp__preview" muted playsInline preload="none" disablePictureInPicture disableRemotePlayback aria-hidden tabIndex={-1} />
      {(playing || paused) && (
        <button type="button" className="vp__ptoggle" onClick={toggle} aria-label={label} title={label}>
          {paused ? <Icon name="play" /> : <PauseIcon />}
        </button>
      )}
    </>
  )
}
