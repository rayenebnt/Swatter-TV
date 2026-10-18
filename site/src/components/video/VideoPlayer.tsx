'use client'
// Lecteur vidéo 16:9 : façade légère pour YouTube, Twitch et Bunny Stream (iframe chargée au clic, selon le consentement),
// flux HLS (natif sur Safari et iOS, sinon hls.js chargé à la demande) et fichiers MP4.
import Image, { getImageProps } from 'next/image'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { preload } from 'react-dom'
import type Hls from 'hls.js'
import { openCookieSettings, useConsent } from '@/components/layout/consent'
import { Icon } from '@/components/ui/Icon'
import { SITE_URL } from '@/lib/site'
import { twitchEmbedUrl, type ResolvedVideo } from '@/lib/video'
import { useOffscreen } from './useOffscreen'
import { fallbackVisual, imageSource } from './utils'
import '@/styles/video.css'

export type VideoPlayerProps = {
  video: ResolvedVideo | null
  /** Image affichée avant la lecture */
  poster?: string | null
  /** Titre de la vidéo (titre de l'iframe, libellés accessibles) */
  title: string
  /** Lecture automatique (sans le son pour les fichiers et flux ; pour YouTube / Twitch / Bunny, seulement si les contenus externes sont acceptés) */
  autoPlay?: boolean
  /** Direct : badge « En direct » */
  live?: boolean
}

type EmbedVideo = Extract<ResolvedVideo, { kind: 'youtube' | 'twitch' | 'iframe' }>
type NativeVideo = Extract<ResolvedVideo, { kind: 'hls' | 'mp4' }>

const SIZES = '(max-width: 1100px) 100vw, 900px'
const PROVIDERS: Record<EmbedVideo['kind'], string> = { youtube: 'YouTube', twitch: 'Twitch', iframe: 'Bunny Stream' }

const noop = () => () => {}
/** Faux au rendu serveur et à l'hydratation, vrai ensuite (sans setState dans un effet). */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)

const sourceKey = (v: ResolvedVideo | null) =>
  !v ? 'none' : v.kind === 'twitch' ? `twitch:${v.param}:${v.value}` : v.kind === 'youtube' || v.kind === 'iframe' ? v.embedUrl : v.src
/** Adresse de l'iframe ; Twitch veut le domaine de la page (connu dans le navigateur, l'iframe n'est jamais rendue côté serveur). */
const embedSrc = (v: EmbedVideo) => (v.kind === 'twitch' ? twitchEmbedUrl(v, [window.location.hostname, new URL(SITE_URL).hostname]) : v.embedUrl)
/** Adresse absolue du site rendue relative (même origine que la page). */
const localize = (url: string) => (url.startsWith(`${SITE_URL}/`) ? url.slice(SITE_URL.length) : url)

export function VideoPlayer(props: VideoPlayerProps) {
  // Nouvelle source → nouveau lecteur : aucun état (lecture, erreur) ne passe d'une vidéo à l'autre.
  return <Player key={sourceKey(props.video)} {...props} />
}

function Player({ video, poster, title, autoPlay = false, live = false }: VideoPlayerProps) {
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])
  const playable = video && !failed ? video : null
  const root = useRef<HTMLDivElement>(null)
  // Badge « En direct » (animation en boucle) en pause hors écran
  const paused = useOffscreen(root, live)

  return (
    <div ref={root} className={`vp${playable ? '' : ' vp--off'}${paused ? ' is-paused' : ''}`} role="region" aria-label={`Lecteur vidéo\u00a0: ${title}`}>
      {!playable ? (
        <Unavailable poster={poster} live={live} />
      ) : playable.kind === 'youtube' || playable.kind === 'twitch' || playable.kind === 'iframe' ? (
        <Embed video={playable} poster={poster} title={title} autoPlay={autoPlay} />
      ) : (
        <Native video={playable} poster={poster} title={title} autoPlay={autoPlay} live={live} onError={fail} />
      )}
      {live && playable && (
        <span className="badge badge--live vp__live">
          <i aria-hidden="true" />
          En direct
        </span>
      )}
    </div>
  )
}

/** Affiche plein cadre (next/image : AVIF/WebP, tailles adaptées), chargée en priorité : le lecteur est l'élément principal de sa page. */
function Poster({ src }: { src: string }) {
  const img = imageSource(src)
  // preload : lien de préchargement dans le <head> (Next 16 : ne pas le combiner avec loading ni fetchPriority)
  return <Image src={img.src} unoptimized={img.unoptimized} alt="" fill sizes={SIZES} preload className="vp__poster" />
}

/** YouTube / Twitch / Bunny Stream : façade (affiche + bouton) ; l'iframe n'est chargée qu'au clic. */
function Embed({ video, poster, title, autoPlay }: { video: EmbedVideo; poster?: string | null; title: string; autoPlay: boolean }) {
  const consent = useConsent()
  const allowed = consent?.externes === true
  // Mention affichée une fois le choix connu : pas de clignotement pour qui a déjà accepté les contenus externes
  const showNotice = useHydrated() && !allowed
  const [clicked, setClicked] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const noticeId = useId()
  // Sans accord global, le clic vaut accord pour cette vidéo seulement (rien n'est enregistré).
  const active = clicked || (autoPlay && allowed)

  useEffect(() => {
    // Le bouton disparaît : le focus passe au lecteur pour continuer au clavier
    if (clicked) frame.current?.focus()
  }, [clicked])

  if (active) {
    return (
      <iframe
        ref={frame}
        className="vp__frame"
        src={embedSrc(video)}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  const img = poster || (video.kind === 'youtube' ? video.thumbnail : null) || fallbackVisual(title)
  return (
    <>
      <Poster src={img} />
      <div className="vp__overlay">
        <button type="button" className="vp__play" onClick={() => setClicked(true)} aria-label={`Lire la vidéo\u00a0: ${title}`} aria-describedby={showNotice ? noticeId : undefined}>
          <Icon name="play" />
        </button>
        {showNotice && (
          <p className="vp__notice">
            <span id={noticeId}>La lecture charge le lecteur {PROVIDERS[video.kind]}, qui peut déposer des cookies.</span>{' '}
            <button type="button" className="vp__cookies" aria-haspopup="dialog" onClick={(e) => openCookieSettings(e.currentTarget)}>
              Gérer les cookies
            </button>
          </p>
        )}
      </div>
    </>
  )
}

/** Affiche optimisée pour l'attribut poster de <video> : une seule adresse, 1 200 px de large (variante « 2x » d'une largeur de 600). */
function posterUrl(src: string): string {
  const img = imageSource(src)
  if (img.unoptimized) return img.src
  return getImageProps({ src: img.src, alt: '', width: 600, height: 338 }).props.src
}

/** Fichier MP4 ou flux HLS : lecteur natif du navigateur. */
function Native({ video, poster, title, autoPlay, live, onError }: { video: NativeVideo; poster?: string | null; title: string; autoPlay: boolean; live: boolean; onError: () => void }) {
  const { kind, src } = video
  const ref = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  // hls.js gère lui-même ses erreurs (et tente de les corriger) : l'événement error de <video> ne compte alors pas.
  const viaHlsJs = useRef(false)
  const posterSrc = poster ? posterUrl(poster) : undefined
  // Fichier diffusé comme un direct (démonstration, boucle d'attente) : lecture en boucle
  const loop = live && kind === 'mp4'
  // Affiche préchargée avec une priorité haute (élément principal de la page)
  if (posterSrc) preload(posterSrc, { as: 'image', fetchPriority: 'high' })

  useEffect(() => {
    const el = ref.current
    if (!el || kind !== 'hls') return
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = localize(src)
      return
    }
    let cancelled = false
    let hls: Hls | null = null
    let onPlay: (() => void) | null = null
    import('hls.js')
      .then(({ default: HlsJs }) => {
        if (cancelled) return
        if (!HlsJs.isSupported()) return onError()
        viaHlsJs.current = true
        // Manifeste chargé tout de suite, segments seulement à la lecture (économie de données)
        const h = new HlsJs({ autoStartLoad: false, lowLatencyMode: live })
        hls = h
        let networkRetries = 0
        let mediaRetries = 0
        // Un segment reçu remet le compteur à zéro : un direct de plusieurs heures survit aux coupures passagères
        h.on(HlsJs.Events.FRAG_LOADED, () => {
          networkRetries = 0
        })
        h.on(HlsJs.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          // Manifeste introuvable ou illisible (aucun niveau) : hls.js a déjà réessayé et startLoad() ne le rechargerait pas
          if (data.type === HlsJs.ErrorTypes.NETWORK_ERROR && h.levels.length && networkRetries++ < 3) h.startLoad()
          else if (data.type === HlsJs.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) h.recoverMediaError()
          else onError()
        })
        h.loadSource(localize(src))
        h.attachMedia(el)
        if (!el.paused) h.startLoad()
        else {
          onPlay = () => h.startLoad()
          el.addEventListener('play', onPlay, { once: true })
        }
      })
      .catch(() => {
        if (!cancelled) onError()
      })
    return () => {
      cancelled = true
      if (onPlay) el.removeEventListener('play', onPlay)
      hls?.destroy()
      viaHlsJs.current = false
    }
  }, [kind, src, live, onError])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Erreur survenue avant l'hydratation (événement manqué)
    if (kind === 'mp4' && el.error) return onError()
    // Lecture automatique : forcément sans le son (règle des navigateurs)
    if (!autoPlay) return
    el.muted = true
    el.play().catch(() => {})
  }, [kind, autoPlay, onError])

  const play = () => {
    const el = ref.current
    if (!el) return
    el.play().catch(() => {})
    // Le bouton disparaît : le focus passe au lecteur (commandes natives au clavier)
    el.focus()
  }

  return (
    <>
      <video
        ref={ref}
        className="vp__video"
        controls
        playsInline
        preload="metadata"
        poster={posterSrc}
        src={kind === 'mp4' ? localize(src) : undefined}
        loop={loop}
        aria-label={title}
        onPlay={() => setStarted(true)}
        onError={() => {
          if (!viaHlsJs.current) onError()
        }}
      >
        Votre navigateur ne permet pas de lire cette vidéo.
      </video>
      {!started && (
        <button type="button" className="vp__play vp__play--native" onClick={play} aria-label={`Lire la vidéo\u00a0: ${title}`}>
          <Icon name="play" />
        </button>
      )}
    </>
  )
}

/** Vidéo absente, source invalide ou erreur de lecture. */
function Unavailable({ poster, live }: { poster?: string | null; live: boolean }) {
  return (
    <>
      {poster && <Poster src={poster} />}
      <div className="vp__overlay vp__overlay--off" role="status">
        <Icon name="tv" className="vp__off-ico" />
        <p className="vp__off-title">Vidéo indisponible</p>
        <p className="vp__off-text">{live ? 'Le direct est momentanément interrompu. Réessayez dans quelques instants.' : 'Cette vidéo ne peut pas être lue pour le moment.'}</p>
      </div>
    </>
  )
}
