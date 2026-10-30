'use client'
// Lecteur de webcam selon le type de flux : image rafraîchie, flux HLS (natif ou hls.js chargé à la demande),
// YouTube (façade puis lecteur youtube-nocookie) ou lecteur à intégrer (iframe), avec la même règle de consentement
// que le lecteur vidéo pour les services externes. Sans lien renseigné : « Bientôt en direct ».
import Image, { getImageProps } from 'next/image'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import type Hls from 'hls.js'
import { openCookieSettings, useConsent } from '@/components/layout/consent'
import { Icon } from '@/components/ui/Icon'
import { youtubeId } from '@/lib/video'
import '@/styles/webcams.css'

export type WebcamPoster = {
  src: string
  width: number
  height: number
  alt: string
  /** Point focal de l'image (object-position), absent pour le centre */
  position?: string
}

/** Données sérialisables d'une webcam pour le lecteur. */
export type WebcamSource = {
  name: string
  place?: string | null
  provider: 'image' | 'hls' | 'youtube' | 'iframe'
  /** null : lien pas encore renseigné, webcam « Bientôt en direct » */
  embedUrl: string | null
  /** Vignette Payload (ou visuel de repli) : premier rendu et repli */
  poster: WebcamPoster
}

type FeedProps = { cam: WebcamSource; sizes: string; priority: boolean }
/** Lecteurs d'un flux : lien renseigné. */
type StreamProps = FeedProps & { cam: WebcamSource & { embedUrl: string } }

/** Rafraîchissement des images : toutes les 60 s, seulement si la webcam est visible. */
const REFRESH_MS = 60_000

const noop = () => () => {}
/** Faux au rendu serveur et à l'hydratation, vrai ensuite. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false)

const isAbsolute = (url: string) => /^https?:\/\//i.test(url)

/** Adresse http(s) absolue ou chemin du site ; null sinon (javascript:, data:…). */
function streamUrl(url: string): string | null {
  const u = url.trim()
  if (u.startsWith('/') && !u.startsWith('//')) return u
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/** Adresse du lecteur YouTube sans cookie : vidéo (ou direct) d'après son lien, ou direct d'une chaîne. */
function youtubeEmbed(url: string): string | null {
  const params = 'autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1'
  const id = youtubeId(url.trim())
  if (id) return `https://www.youtube-nocookie.com/embed/${id}?${params}`
  const channel = url.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1]
  return channel ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${channel}&${params}` : null
}

/** Vignette plein cadre (next/image : AVIF/WebP, tailles adaptées), cadrée sur son point focal (variable CSS : le plein écran la centre). */
function Poster({ poster, sizes, priority }: { poster: WebcamPoster; sizes: string; priority: boolean }) {
  return (
    <Image
      className="wcp__img"
      src={poster.src}
      alt={poster.alt}
      fill
      sizes={sizes}
      preload={priority}
      unoptimized={isAbsolute(poster.src)}
      style={{ '--focal': poster.position } as CSSProperties}
    />
  )
}

function Unavailable({ cam, sizes, priority }: FeedProps) {
  return (
    <div className="wcp">
      <Poster poster={cam.poster} sizes={sizes} priority={priority} />
      <p className="wcp__msg">Flux momentanément indisponible</p>
    </div>
  )
}

/** Webcam annoncée, dont le lien n'est pas encore renseigné dans l'administration. */
function ComingSoon({ cam, sizes, priority }: FeedProps) {
  return (
    <div className="wcp">
      <Poster poster={cam.poster} sizes={sizes} priority={priority} />
      <p className="wcp__msg">Bientôt en direct</p>
    </div>
  )
}

/* ----- Image rafraîchie ----- */

/** Paramètre anti-cache (même origine : chemin relatif). */
function withCacheBuster(url: string, t: number): string {
  const u = new URL(url, window.location.href)
  u.searchParams.set('_', String(t))
  return u.origin === window.location.origin ? `${u.pathname}${u.search}` : u.toString()
}

function ImageFeed({ cam, sizes, priority }: StreamProps) {
  const root = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<string | null>(null)
  const url = useMemo(() => streamUrl(cam.embedUrl), [cam.embedUrl])

  useEffect(() => {
    const el = root.current
    if (!el || !url || typeof IntersectionObserver === 'undefined') return
    let visible = false
    let last = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let probe: HTMLImageElement | null = null

    const cancelProbe = () => {
      if (!probe) return
      probe.onload = null
      probe.onerror = null
      probe.removeAttribute('src')
      probe = null
    }
    // Préchargement hors page : l'image affichée ne change qu'une fois la nouvelle vue reçue (sinon on garde la précédente)
    const load = () => {
      last = Date.now()
      const src = withCacheBuster(url, last)
      cancelProbe()
      const img = document.createElement('img')
      img.decoding = 'async'
      img.onload = () => {
        if (probe === img) setLive(src)
      }
      img.onerror = () => {
        if (probe === img) probe = null
      }
      probe = img
      img.src = src
    }
    const plan = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      if (!visible || document.hidden) return
      timer = setTimeout(
        () => {
          load()
          plan()
        },
        Math.max(0, last + REFRESH_MS - Date.now()),
      )
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      plan()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', plan)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', plan)
      if (timer !== undefined) clearTimeout(timer)
      cancelProbe()
    }
  }, [url])

  return (
    <div ref={root} className="wcp">
      {live ? (
        <Image className="wcp__img" src={live} alt={`Vue en direct\u00a0: ${cam.name}`} fill sizes={sizes} unoptimized loading={priority ? 'eager' : undefined} />
      ) : (
        <Poster poster={cam.poster} sizes={sizes} priority={priority} />
      )}
    </div>
  )
}

/* ----- Flux HLS ----- */

/** Affiche optimisée pour l'attribut poster de <video> (une seule adresse). */
function videoPoster(poster: WebcamPoster): string {
  if (isAbsolute(poster.src)) return poster.src
  return getImageProps({ src: poster.src, alt: '', width: 960, height: 540 }).props.src
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5h2.6v13H8zM13.4 5.5H16v13h-2.6z" fill="currentColor" />
    </svg>
  )
}

function HlsFeed({ cam, sizes, priority }: StreamProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  // Choix de l'internaute (bouton lecture / pause) ; null : lecture automatique quand la webcam est visible
  const wanted = useRef<boolean | null>(null)
  const sync = useRef<() => void>(() => {})
  const src = useMemo(() => streamUrl(cam.embedUrl), [cam.embedUrl])
  const poster = useMemo(() => videoPoster(cam.poster), [cam.poster])

  useEffect(() => {
    const el = ref.current
    // En cas d'échec, le nettoyage ci-dessous détruit le lecteur (le <video> n'est plus affiché)
    if (failed || !el || !src || typeof IntersectionObserver === 'undefined') return
    // Pas de lecture automatique si l'internaute limite les animations
    const auto = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Part visible du lecteur : lecture automatique à partir d'un quart, lecture demandée dès qu'il est à l'écran
    let ratio = 0
    let cancelled = false
    let hls: Hls | null = null
    let loading = false
    let ready: Promise<void> | null = null

    const attach = () =>
      (ready ??= (async () => {
        if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.src = src
          return
        }
        const { default: HlsJs } = await import('hls.js')
        if (cancelled) return
        if (!HlsJs.isSupported()) return setFailed(true)
        // Manifeste chargé tout de suite, segments seulement pendant la lecture
        const h = new HlsJs({ autoStartLoad: false, lowLatencyMode: true })
        hls = h
        let networkRetries = 0
        let mediaRetries = 0
        h.on(HlsJs.Events.FRAG_LOADED, () => {
          networkRetries = 0
        })
        h.on(HlsJs.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          if (data.type === HlsJs.ErrorTypes.NETWORK_ERROR && h.levels.length && networkRetries++ < 3) h.startLoad(-1)
          else if (data.type === HlsJs.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) h.recoverMediaError()
          else setFailed(true)
        })
        h.loadSource(src)
        h.attachMedia(el)
      })().catch(() => {
        if (!cancelled) setFailed(true)
      }))

    const shouldPlay = () => {
      if (document.hidden || wanted.current === false) return false
      return wanted.current === true ? ratio > 0 : auto && ratio >= 0.25
    }
    const update = () => {
      if (!shouldPlay()) {
        if (!el.paused) el.pause()
        if (hls && loading) {
          hls.stopLoad()
          loading = false
        }
        return
      }
      void attach().then(() => {
        if (cancelled || !shouldPlay()) return
        if (hls && !loading) {
          // Reprise au plus près du direct
          hls.startLoad(-1)
          loading = true
        } else if (!hls && el.seekable.length) {
          const edge = el.seekable.end(el.seekable.length - 1)
          if (edge - el.currentTime > 10) el.currentTime = edge - 2
        }
        el.muted = true
        el.play().catch(() => {})
      })
    }
    sync.current = update

    const onPlaying = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    // Lecture native (Safari) : une erreur du lecteur signale un flux illisible
    const onError = () => {
      if (!hls) setFailed(true)
    }
    el.addEventListener('playing', onPlaying)
    el.addEventListener('pause', onPause)
    el.addEventListener('error', onError)
    const io = new IntersectionObserver(
      ([entry]) => {
        ratio = entry.isIntersecting ? entry.intersectionRatio : 0
        update()
      },
      { threshold: [0, 0.25] },
    )
    io.observe(el)
    document.addEventListener('visibilitychange', update)

    return () => {
      cancelled = true
      sync.current = () => {}
      io.disconnect()
      document.removeEventListener('visibilitychange', update)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('error', onError)
      if (hls) hls.destroy()
      else if (el.getAttribute('src')) {
        el.removeAttribute('src')
        el.load()
      }
    }
  }, [src, failed])

  if (!src || failed) return <Unavailable cam={cam} sizes={sizes} priority={priority} />

  const toggle = () => {
    wanted.current = !playing
    sync.current()
  }

  return (
    <div className="wcp">
      <video ref={ref} className="wcp__video" muted playsInline preload="none" poster={poster} aria-label={`Webcam en direct\u00a0: ${cam.name}`} />
      <button type="button" className="wcp__toggle" onClick={toggle} aria-label={playing ? 'Mettre le direct en pause' : 'Lire le direct'}>
        {playing ? <PauseIcon /> : <Icon name="play" />}
      </button>
    </div>
  )
}

/* ----- YouTube et lecteur à intégrer (services externes) ----- */

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }

/** Rouvre le panneau des cookies, après être sorti du plein écran (le bandeau resterait invisible derrière). */
function manageCookies(e: MouseEvent<HTMLButtonElement>) {
  const button = e.currentTarget
  const doc = document as FsDocument
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.()
  openCookieSettings(button)
}

function EmbedFeed({ cam, sizes, priority }: StreamProps) {
  const consent = useConsent()
  const allowed = consent?.externes === true
  // Mention affichée une fois le choix connu : pas de clignotement pour qui a déjà accepté les contenus externes
  const showNotice = useHydrated() && !allowed
  const [clicked, setClicked] = useState(false)
  const [near, setNear] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const noticeId = useId()
  const isIframe = cam.provider === 'iframe'
  const src = useMemo(() => (cam.provider === 'youtube' ? youtubeEmbed(cam.embedUrl) : isAbsolute(cam.embedUrl.trim()) ? streamUrl(cam.embedUrl) : null), [cam.provider, cam.embedUrl])
  // Sans accord global, le clic vaut accord pour ce flux seulement (rien n'est enregistré).
  // Lecteur à intégrer : chargé à l'approche si les contenus externes sont acceptés.
  const active = clicked || (isIframe && allowed && near)

  useEffect(() => {
    const el = root.current
    if (!isIframe || !allowed || active || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setNear(true)
        io.disconnect()
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isIframe, allowed, active])

  useEffect(() => {
    // Le bouton disparaît : le focus passe au lecteur pour continuer au clavier
    if (clicked) frame.current?.focus()
  }, [clicked])

  if (!src) return <Unavailable cam={cam} sizes={sizes} priority={priority} />

  if (active) {
    return (
      <div className="wcp">
        <iframe
          ref={frame}
          className="wcp__frame"
          src={src}
          title={`Webcam en direct\u00a0: ${cam.name}${cam.place ? ` — ${cam.place}` : ''}`}
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  return (
    <div ref={root} className="wcp">
      <Poster poster={cam.poster} sizes={sizes} priority={priority} />
      <div className="wcp__overlay">
        <button type="button" className="wcp__play" onClick={() => setClicked(true)} aria-label={`Afficher la webcam en direct\u00a0: ${cam.name}`} aria-describedby={showNotice ? noticeId : undefined}>
          <Icon name="play" />
        </button>
        {showNotice && (
          <p className="wcp__notice">
            <span id={noticeId}>Ce flux est fourni par un service externe qui peut déposer des cookies.</span>{' '}
            <button type="button" className="wcp__cookies" aria-haspopup="dialog" onClick={manageCookies}>
              Gérer les cookies
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

/** Lecteur de webcam plein cadre (le parent fixe les proportions et le positionnement). */
export function WebcamPlayer({ cam, sizes = '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw', priority = false }: { cam: WebcamSource; sizes?: string; priority?: boolean }) {
  // Nouvelle source → nouveau lecteur : aucun état ne passe d'un flux à l'autre
  const key = `${cam.provider}:${cam.embedUrl}`
  const { embedUrl } = cam
  if (!embedUrl) return <ComingSoon cam={cam} sizes={sizes} priority={priority} />
  const stream = { ...cam, embedUrl }
  switch (cam.provider) {
    case 'image':
      return <ImageFeed key={key} cam={stream} sizes={sizes} priority={priority} />
    case 'hls':
      return <HlsFeed key={key} cam={stream} sizes={sizes} priority={priority} />
    default:
      return <EmbedFeed key={key} cam={stream} sizes={sizes} priority={priority} />
  }
}
