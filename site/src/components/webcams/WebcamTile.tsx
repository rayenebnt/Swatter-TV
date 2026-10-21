'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { LiveClock } from './LiveClock'
import { WebcamPlayer, type WebcamSource } from './WebcamPlayer'
import '@/styles/webcams.css'

/** Webcam de la page Webcams (données sérialisables). */
export type WebcamView = WebcamSource & { id: number; slug: string; temperature?: string | null }

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void }
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void }

const SIZES = '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 440px'
const FOCUSABLE = 'a[href], button:not([disabled]), iframe, video[controls], [tabindex]:not([tabindex="-1"])'

const fullscreenElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null

/** Quitte le plein écran natif (avec ou sans préfixe). */
function leaveFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
  else (document as FsDocument).webkitExitFullscreen?.()
}

/** Garde le focus dans le calque plein écran de repli. */
function trapFocus(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const outside = !root.contains(active)
  if (e.shiftKey && (active === first || outside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || outside)) {
    e.preventDefault()
    first.focus()
  }
}

/**
 * Webcam en direct avec bouton plein écran : API Fullscreen si disponible,
 * sinon calque fixe (iPhone…) qui se ferme avec Échap ou le bouton de fermeture.
 */
export function WebcamTile({ cam, index }: { cam: WebcamView; index: number }) {
  const screen = useRef<HTMLDivElement>(null)
  const openBtn = useRef<HTMLButtonElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const [mode, setMode] = useState<'off' | 'native' | 'overlay'>('off')
  const titleId = `webcam-${cam.slug}`

  // Plein écran natif : suit l'entrée et la sortie (touche Échap, geste du navigateur)
  useEffect(() => {
    const onChange = () => setMode((m) => (fullscreenElement() === screen.current ? 'native' : m === 'native' ? 'off' : m))
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // Plein écran : Échap pour quitter, focus retenu ; calque de repli : défilement de la page bloqué en plus
  useEffect(() => {
    if (mode === 'off') return
    const root = document.documentElement
    const previous = root.style.overflow
    if (mode === 'overlay') root.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      // Focus dans une autre boîte de dialogue (panneau des cookies ouvert depuis le lecteur…) : on la laisse gérer
      const current = document.activeElement
      if (current instanceof Element && !screen.current?.contains(current) && current.closest('[role="dialog"]')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (mode === 'overlay') setMode('off')
        else leaveFullscreen()
      } else if (e.key === 'Tab') trapFocus(e, screen.current)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      if (mode === 'overlay') root.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [mode])

  // Focus : sur le bouton de fermeture à l'ouverture, de retour sur le bouton plein écran à la sortie
  useEffect(() => {
    if (mode !== 'off') closeBtn.current?.focus()
    else if (wasOpen.current) openBtn.current?.focus()
    wasOpen.current = mode !== 'off'
  }, [mode])

  // Démontage en plein écran natif (navigation) : on en sort
  useEffect(() => {
    const el = screen.current
    return () => {
      if (el && fullscreenElement() === el) leaveFullscreen()
    }
  }, [])

  const enter = async () => {
    const el = screen.current as FsElement | null
    if (!el) return
    const doc = document as FsDocument
    if (document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen()
        return
      } catch {
        // refusé : calque de repli
      }
    } else if (doc.webkitFullscreenEnabled && el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen()
      return
    }
    setMode('overlay')
  }

  const exit = () => (mode === 'native' ? leaveFullscreen() : setMode('off'))

  const dialog = mode === 'overlay' ? { role: 'dialog', 'aria-modal': true, 'aria-label': `Webcam ${cam.name} en plein écran` } : {}
  // lien du flux pas encore renseigné : annoncée, sans direct ni plein écran
  const soon = !cam.embedUrl

  return (
    // État du calque en attribut : modifier className effacerait la classe « is-in » posée par la révélation au défilement
    <article
      id={cam.slug}
      data-preview={`webcam-${cam.slug}`}
      className="card camp"
      aria-labelledby={titleId}
      data-reveal
      data-expanded={mode === 'overlay' ? '' : undefined}
      style={{ '--d': index % 3 } as CSSProperties}
    >
      <div ref={screen} className={mode === 'off' ? 'camp__screen' : 'camp__screen is-full'} {...dialog}>
        <WebcamPlayer cam={cam} sizes={SIZES} priority={index < 3} />
        {/* webcam pas encore en ligne : le lecteur affiche « Bientôt en direct » */}
        {!soon && (
          <div className="cam__top" aria-hidden="true">
            <span className="badge badge--live">
              <i />
              En direct
            </span>
            <span className="cam__clock">
              <LiveClock />
              {cam.temperature && <span className="cam__temp"> · {cam.temperature}</span>}
            </span>
          </div>
        )}
        {mode !== 'off' && (
          <>
            <p className="camp__caption">
              <b>{cam.name}</b>
              {cam.place && <span>{cam.place}</span>}
            </p>
            <button ref={closeBtn} type="button" className="icon-btn camp__close" onClick={exit} aria-label="Quitter le plein écran">
              <Icon name="x" />
            </button>
          </>
        )}
      </div>
      <div className="camp__body">
        <div className="camp__text">
          <h2 className="camp__name" id={titleId}>
            {cam.name}
          </h2>
          {cam.place && <p className="camp__place">{cam.place}</p>}
        </div>
        {cam.temperature && (
          <p className="camp__temp">
            <span className="sr-only">Température&nbsp;: </span>
            {cam.temperature}
          </p>
        )}
        {!soon && (
          <button ref={openBtn} type="button" className="icon-btn camp__fs" onClick={enter} aria-label={`Afficher la webcam ${cam.name} en plein écran`}>
            <Icon name="expand" />
          </button>
        )}
      </div>
    </article>
  )
}
