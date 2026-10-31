'use client'
// Lecteur vidéo 16:9 : façade légère pour YouTube, Twitch et Bunny Stream (iframe chargée au clic, selon le consentement),
// flux HLS (natif sur Safari et iOS, sinon hls.js chargé à la demande) et fichiers MP4. Derrière le bouton de lecture,
// l'aperçu animé de la vidéo tourne en boucle (avec un bouton pause). Le direct (autoPlay) démarre seul, sans le son,
// quand il est visible.
import Image, { getImageProps } from 'next/image'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { preload } from 'react-dom'
import type Hls from 'hls.js'
import { openCookieSettings, useConsent } from '@/components/layout/consent'
import { recordWatch } from '@/components/members/recordWatch'
import { Icon } from '@/components/ui/Icon'
import { WholeFrame } from '@/components/ui/MediaImage'
import type { Orientation } from '@/lib/media'
import { SITE_URL } from '@/lib/site'
import { mutedEmbedUrl, twitchEmbedUrl, type ResolvedVideo } from '@/lib/video'
import { useAutoplayAllowed } from './motion'
import { VISIBLE_RATIO } from './preview-director'
import { useOffscreen } from './useOffscreen'
import { fallbackVisual, imageSource } from './utils'
import { PlayerPreview } from './VideoPreview'
import '@/styles/video.css'

export type VideoPlayerProps = {
  video: ResolvedVideo | null
  /** Image affichée avant la lecture */
  poster?: string | null
  /** Cadrage de l'affiche (object-position : point focal de la couverture, voir mediaFocal) */
  posterPosition?: string
  /** Affiche entière sur fond flou (photo en hauteur ou carrée dans le cadre 16:9) : son orientation, voir wholeOrientation */
  posterOrientation?: Orientation
  /** Aperçu animé (adresse d'un court extrait muet) : en boucle derrière le bouton de lecture tant que le lecteur est visible */
  preview?: string | null
  /** Titre de la vidéo (titre de l'iframe, libellés accessibles) */
  title: string
  /**
   * Direct : lecture automatique sans le son dès que le lecteur est visible (fichiers et flux ; YouTube, Twitch et Bunny
   * seulement si les contenus externes sont acceptés), jamais en « réduire les animations » ni en économie de données
   */
  autoPlay?: boolean
  /** Direct : badge « En direct » */
  live?: boolean
  /** Espace membres : contenu ajouté une fois à l'historique du membre connecté, au premier démarrage réel de la lecture */
  history?: { kind: 'video' | 'replay'; id: number }
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
/**
 * Adresse de l'iframe ; Twitch veut le domaine de la page (connu dans le navigateur, l'iframe n'est jamais rendue côté
 * serveur). `muted` : lecteur lancé seul, sans le son (seule lecture automatique admise par les navigateurs).
 */
const embedSrc = (v: EmbedVideo, muted: boolean) =>
  v.kind === 'twitch' ? twitchEmbedUrl(v, [window.location.hostname, new URL(SITE_URL).hostname], muted) : muted ? mutedEmbedUrl(v) : v.embedUrl
/** Adresse absolue du site rendue relative (même origine que la page). */
const localize = (url: string) => (url.startsWith(`${SITE_URL}/`) ? url.slice(SITE_URL.length) : url)

/** Vrai dès que l'élément a été visible à 60 % (et le reste ensuite) ; toujours faux si `enabled` est faux. */
function useSeen(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!enabled || seen || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) setSeen(true)
      },
      { threshold: VISIBLE_RATIO },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, enabled, seen])
  return enabled && seen
}

export function VideoPlayer(props: VideoPlayerProps) {
  // Nouvelle source → nouveau lecteur : aucun état (lecture, erreur) ne passe d'une vidéo à l'autre.
  return <Player key={sourceKey(props.video)} {...props} />
}

function Player({ video, poster, posterPosition, posterOrientation, preview, title, autoPlay = false, live = false, history }: VideoPlayerProps) {
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])
  // Historique : un seul envoi par lecteur (donc par source), au premier démarrage de la lecture
  const recorded = useRef(false)
  const historyKind = history?.kind
  const historyId = history?.id
  const onStart = useCallback(() => {
    if (recorded.current || !historyKind || !historyId) return
    recorded.current = true
    recordWatch({ kind: historyKind, id: historyId })
  }, [historyKind, historyId])
  const playable = video && !failed ? video : null
  const root = useRef<HTMLDivElement>(null)
  // Badge « En direct » (animation en boucle) en pause hors écran
  const paused = useOffscreen(root, live)

  return (
    <div ref={root} className={`vp${playable ? '' : ' vp--off'}${paused ? ' is-paused' : ''}`} role="region" aria-label={`Lecteur vidéo : ${title}`}>
      {!playable ? (
        <Unavailable poster={poster} posterPosition={posterPosition} posterOrientation={posterOrientation} live={live} />
      ) : playable.kind === 'youtube' || playable.kind === 'twitch' || playable.kind === 'iframe' ? (
        <Embed
          video={playable}
          poster={poster}
          posterPosition={posterPosition}
          posterOrientation={posterOrientation}
          preview={preview}
          title={title}
          autoPlay={autoPlay}
          root={root}
          onStart={onStart}
        />
      ) : (
        <Native video={playable} poster={poster} preview={preview} title={title} autoPlay={autoPlay} live={live} onError={fail} onStart={onStart} />
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

/**
 * Affiche plein cadre (next/image : AVIF/WebP, tailles adaptées), chargée en priorité : le lecteur est l'élément principal
 * de sa page. `position` : cadrage (point focal de la couverture). `orientation` : affiche entière sur fond flou (WholeFrame,
 * mêmes sources : un seul fichier), chargée tout de suite et en priorité plutôt que préchargée.
 */
function Poster({ src, position, orientation }: { src: string; position?: string; orientation?: Orientation }) {
  const img = imageSource(src)
  if (orientation) {
    const props = getImageProps({ src: img.src, unoptimized: img.unoptimized, alt: '', fill: true, sizes: SIZES, loading: 'eager', fetchPriority: 'high' }).props
    return <WholeFrame img={props} orientation={orientation} className="vp__poster" style={{ '--focal': position } as CSSProperties} />
  }
  // preload : lien de préchargement dans le <head> (Next 16 : ne pas le combiner avec loading ni fetchPriority)
  return <Image src={img.src} unoptimized={img.unoptimized} alt="" fill sizes={SIZES} preload className="vp__poster" style={position ? { objectPosition: position } : undefined} />
}

/**
 * YouTube / Twitch / Bunny Stream : façade (affiche, aperçu animé, bouton) ; l'iframe n'est chargée qu'au clic. Direct
 * (autoPlay) : chargée seule, sans le son, une fois le lecteur visible, si les contenus externes sont acceptés.
 */
function Embed({
  video,
  poster,
  posterPosition,
  posterOrientation,
  preview,
  title,
  autoPlay,
  root,
  onStart,
}: {
  video: EmbedVideo
  poster?: string | null
  posterPosition?: string
  posterOrientation?: Orientation
  preview?: string | null
  title: string
  autoPlay: boolean
  root: RefObject<HTMLDivElement | null>
  onStart: () => void
}) {
  const consent = useConsent()
  const allowed = consent?.externes === true
  // Mention affichée une fois le choix connu : pas de clignotement pour qui a déjà accepté les contenus externes
  const showNotice = useHydrated() && !allowed
  const [clicked, setClicked] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const noticeId = useId()
  const motion = useAutoplayAllowed()
  // Lecture automatique : seulement avec l'accord global aux contenus externes, une fois le lecteur à l'écran
  const auto = useSeen(root, autoPlay && allowed && motion)
  // Sans accord global, le clic vaut accord pour cette vidéo seulement (rien n'est enregistré).
  const active = clicked || auto

  useEffect(() => {
    // Le bouton disparaît : le focus passe au lecteur pour continuer au clavier
    if (clicked) frame.current?.focus()
  }, [clicked])

  useEffect(() => {
    // Lecture demandée (clic) : historique du membre ; un lecteur lancé seul, sans le son, n'y entre pas
    if (clicked) onStart()
  }, [clicked, onStart])

  if (active) {
    return (
      <iframe
        ref={frame}
        className="vp__frame"
        src={embedSrc(video, !clicked)}
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
      {/* orientation de l'affiche choisie (pas de la vignette YouTube de repli) */}
      <Poster src={img} position={posterPosition} orientation={poster ? posterOrientation : undefined} />
      {preview && <PlayerPreview src={preview} />}
      <div className="vp__overlay">
        <button type="button" className="vp__play" onClick={() => setClicked(true)} aria-label={`Lire la vidéo : ${title}`} aria-describedby={showNotice ? noticeId : undefined}>
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

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Fichier MP4 ou flux HLS : lecteur natif du navigateur. */
function Native({
  video,
  poster,
  preview,
  title,
  autoPlay,
  live,
  onError,
  onStart,
}: {
  video: NativeVideo
  poster?: string | null
  preview?: string | null
  title: string
  autoPlay: boolean
  live: boolean
  onError: () => void
  onStart: () => void
}) {
  const { kind, src } = video
  const ref = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  // Lecture automatique sans le son en cours : bouton « Activer le son »
  const [mutedAuto, setMutedAuto] = useState(false)
  // hls.js gère lui-même ses erreurs (et tente de les corriger) : l'événement error de <video> ne compte alors pas.
  const viaHlsJs = useRef(false)
  // La lecture en cours a été lancée seule (sans le son) : pas d'historique tant que l'internaute ne s'en saisit pas
  const auto = useRef(false)
  // L'internaute a pris la main (son, pause, bouton de lecture) : plus de lecture ni de pause automatiques
  const takeover = useRef(false)
  // Pause demandée par le lecteur lui-même (direct sorti de l'écran), à distinguer d'une pause de l'internaute
  const autoPausing = useRef(false)
  const motion = useAutoplayAllowed()
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
    // Erreur survenue avant l'hydratation (événement manqué)
    if (kind === 'mp4' && ref.current?.error) onError()
  }, [kind, onError])

  useEffect(() => {
    const el = ref.current
    // Direct : lecture sans le son (règle des navigateurs) quand le lecteur est visible, pause hors écran ou onglet masqué
    if (!el || !autoPlay || !motion || typeof IntersectionObserver === 'undefined') return
    let ratio = 0
    const update = () => {
      if (takeover.current) return
      if (ratio >= VISIBLE_RATIO && !document.hidden) {
        if (!el.paused) return
        auto.current = true
        el.muted = true
        // rejet silencieux (économie d'énergie d'iOS…) : le bouton de lecture reste affiché
        el.play().catch(() => {})
      } else if (!el.paused) {
        autoPausing.current = true
        el.pause()
      }
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        ratio = entry.isIntersecting ? entry.intersectionRatio : 0
        update()
      },
      { threshold: [0, VISIBLE_RATIO] },
    )
    io.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', update)
      // « Réduire les animations » activé pendant la lecture automatique (toujours sans le son) : arrêt
      if (auto.current && !takeover.current && !el.paused) {
        autoPausing.current = true
        el.pause()
      }
    }
  }, [autoPlay, motion])

  const play = () => {
    const el = ref.current
    if (!el) return
    // Lecture demandée : avec le son, et plus de pilotage automatique
    takeover.current = true
    auto.current = false
    el.muted = false
    el.play().catch(() => {})
    // Le bouton disparaît : le focus passe au lecteur (commandes natives au clavier)
    el.focus()
  }

  const unmute = () => {
    const el = ref.current
    if (!el) return
    takeover.current = true
    el.muted = false
    if (el.paused) el.play().catch(() => {})
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
        onPlay={() => {
          setStarted(true)
          if (!auto.current) onStart()
        }}
        onPlaying={(e) => {
          if (auto.current && e.currentTarget.muted) setMutedAuto(true)
        }}
        onPause={() => {
          // Pause choisie par l'internaute (commandes du lecteur) : le direct ne repart plus tout seul
          if (autoPausing.current) autoPausing.current = false
          else takeover.current = true
        }}
        onVolumeChange={(e) => {
          if (e.currentTarget.muted) return
          setMutedAuto(false)
          // Son activé : la lecture devient une vraie lecture (historique du membre)
          if (auto.current) {
            auto.current = false
            takeover.current = true
            onStart()
          }
        }}
        onError={() => {
          if (!viaHlsJs.current) onError()
        }}
      >
        Votre navigateur ne permet pas de lire cette vidéo.
      </video>
      {!started && preview && <PlayerPreview src={preview} />}
      {!started && (
        <button type="button" className="vp__play vp__play--native" onClick={play} aria-label={`Lire la vidéo : ${title}`}>
          <Icon name="play" />
        </button>
      )}
      {mutedAuto && (
        <button type="button" className="vp__unmute" onClick={unmute}>
          <SoundIcon />
          Activer le son
        </button>
      )}
    </>
  )
}

/** Vidéo absente, source invalide ou erreur de lecture. */
function Unavailable({ poster, posterPosition, posterOrientation, live }: { poster?: string | null; posterPosition?: string; posterOrientation?: Orientation; live: boolean }) {
  return (
    <>
      {poster && <Poster src={poster} position={posterPosition} orientation={posterOrientation} />}
      <div className="vp__overlay vp__overlay--off" role="status">
        <Icon name="tv" className="vp__off-ico" />
        <p className="vp__off-title">Vidéo indisponible</p>
        <p className="vp__off-text">{live ? 'Le direct est momentanément interrompu. Réessayez dans quelques instants.' : 'Cette vidéo ne peut pas être lue pour le moment.'}</p>
      </div>
    </>
  )
}
