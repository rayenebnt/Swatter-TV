'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LiveProgress, type LiveSlot } from './LiveProgress'
import { Snow } from './Snow'
import { useHydrated, usePageHidden, useReducedMotion } from './useMotion'

export type HeroBadge = { label: string; style: 'live' | 'gold' | 'glass' }
export type HeroLink = { label: string; href: string; icon: IconName | null }
export type HeroLive = { slots: LiveSlot[]; current: boolean; showTitle: boolean }

/** Diapositive prête à l'affichage (textes sérialisables + images rendues côté serveur). */
export type HeroSlide = {
  key: string
  badges: HeroBadge[]
  line1: string
  line2: string | null
  description: string | null
  navLabel: string
  navTitle: string
  primary: HeroLink | null
  secondary: HeroLink | null
  live: HeroLive | null
  /** Image de fond (HeroImage : photo, précédée de son fond flou quand elle s'affiche entière) */
  media: ReactNode
  /** Photo entière sur fond flou : « phone » (téléphone), « tall » (tablette tenue en hauteur), voir heroWhole */
  whole?: string
  /** Vignette de navigation */
  thumb: ReactNode
}

const SWIPE_MIN = 50

function Cta({ link, variant }: { link: HeroLink; variant: 'gold' | 'ghost' }) {
  const content = (
    <>
      {link.icon && <Icon name={link.icon} />}
      {link.label}
    </>
  )
  const className = `btn btn--${variant}`
  // Lien saisi dans l'administration : interne (navigation Next) ou externe
  return link.href.startsWith('/') && !link.href.startsWith('//') ? (
    <Link className={className} href={link.href}>
      {content}
    </Link>
  ) : (
    <a className={className} href={link.href} rel="noopener">
      {content}
    </a>
  )
}

/**
 * Carrousel du héros (maquette : « Héros : carrousel »).
 * Lecture automatique de 8 s pilotée par l'animation CSS des barres de progression (fin d'animation = diapositive
 * suivante) : la pause (survol des vignettes, focus clavier, onglet masqué, héros hors écran) fige simplement l'animation.
 * Ni lecture automatique, ni zoom, ni parallaxe, ni neige si l'utilisateur préfère réduire les animations.
 */
export function HeroClient({ slides, rating }: { slides: HeroSlide[]; rating?: ReactNode }) {
  const n = slides.length
  const uid = useId()
  const heroRef = useRef<HTMLElement>(null)
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const touch = useRef<{ x: number; y: number } | null>(null)

  // Diapositive affichée et précédente (qui garde son zoom pendant le fondu de sortie)
  const [{ cur, prev }, setPos] = useState({ cur: 0, prev: -1 })
  const [visible, setVisible] = useState(true)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const hidden = usePageHidden()
  // En pause tant que la page n'est pas hydratée : la barre ne peut pas finir avant que l'on écoute sa fin
  const paused = !hydrated || reduced || hidden || !visible || hovering || focused

  const go = useCallback(
    (i: number) =>
      setPos((p) => {
        const next = ((i % n) + n) % n
        return next === p.cur ? p : { cur: next, prev: p.cur }
      }),
    [n],
  )
  const slideId = (i: number) => `${uid}-s${i}`

  // Héros hors écran : pause
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([en]) => setVisible(en.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Parallaxe à la souris (variables CSS --px/--py posées directement, une fois par image)
  useEffect(() => {
    const el = heroRef.current
    if (!el || reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0
    let last: PointerEvent | null = null
    const apply = () => {
      raf = 0
      if (!last) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--px', ((last.clientX - r.left) / r.width - 0.5).toFixed(3))
      el.style.setProperty('--py', ((last.clientY - r.top) / r.height - 0.5).toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const reset = () => {
      cancelAnimationFrame(raf)
      raf = 0
      last = null
      el.style.setProperty('--px', '0')
      el.style.setProperty('--py', '0')
    }
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', reset)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', reset)
      cancelAnimationFrame(raf)
      el.style.removeProperty('--px')
      el.style.removeProperty('--py')
    }
  }, [reduced])

  // Flèches gauche/droite n'importe où dans le héros ; Début/Fin sur les vignettes (onglets).
  // Le focus passe sur la vignette de la nouvelle diapositive (l'ancienne devient inerte : le focus n'y est pas perdu).
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (n < 2) return
    const onTab = e.target instanceof HTMLElement && e.target.getAttribute('role') === 'tab'
    let next = -1
    if (e.key === 'ArrowRight') next = (cur + 1) % n
    else if (e.key === 'ArrowLeft') next = (cur - 1 + n) % n
    else if (onTab && e.key === 'Home') next = 0
    else if (onTab && e.key === 'End') next = n - 1
    if (next < 0) return
    e.preventDefault()
    go(next)
    tabsRef.current[next]?.focus()
  }

  // Pause au focus clavier uniquement (un clic de souris sur une vignette ne fige pas le carrousel)
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    let keyboard = true
    try {
      keyboard = e.target.matches(':focus-visible')
    } catch {
      // navigateur sans :focus-visible : on met en pause par prudence
    }
    setFocused(keyboard)
  }
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setFocused(false)
  }

  // Balayage tactile horizontal
  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    const t = e.touches[0]
    touch.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const s = touch.current
    touch.current = null
    const t = e.changedTouches[0]
    if (!s || !t || n < 2) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.2) go(cur + (dx < 0 ? 1 : -1))
  }

  return (
    <section
      data-preview="hero"
      ref={heroRef}
      className={paused ? 'hero is-paused' : 'hero'}
      aria-roledescription="carrousel"
      aria-label="À l’antenne et à la une"
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Région annoncée poliment quand la lecture automatique est arrêtée (changement voulu par l'utilisateur) */}
      <div className="hero__slides" aria-live={paused ? 'polite' : 'off'}>
        {slides.map((s, i) => {
          const active = i === cur
          const Title = i === 0 ? 'h1' : 'h2'
          return (
            <div
              key={s.key}
              id={slideId(i)}
              className={active ? 'slide is-active' : i === prev ? 'slide is-prev' : 'slide'}
              data-whole={s.whole}
              role="group"
              aria-roledescription="diapositive"
              aria-label={`${i + 1} sur ${n}`}
              inert={!active}
            >
              <div className="slide__media">{s.media}</div>
              <div className="container slide__content">
                <div className="slide__inner">
                  {s.badges.length > 0 && (
                    <div className="badges fx" style={{ '--i': 0 } as CSSProperties}>
                      {s.badges.map((b, j) => (
                        <span key={j} className={`badge badge--${b.style}`}>
                          {b.style === 'live' && <i aria-hidden="true" />}
                          {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <Title className="slide__title">
                    <span className="line" style={{ '--i': 0 } as CSSProperties}>
                      <span>{s.line1}</span>
                    </span>
                    {s.line2 && (
                      <span className="line" style={{ '--i': 1 } as CSSProperties}>
                        <span>
                          {' '}
                          <em>{s.line2}</em>
                        </span>
                      </span>
                    )}
                  </Title>
                  {s.description && (
                    <p className="slide__desc fx" style={{ '--i': 1 } as CSSProperties}>
                      {s.description}
                    </p>
                  )}
                  {s.live && (
                    <LiveProgress
                      slots={s.live.slots}
                      current={s.live.current}
                      showTitle={s.live.showTitle}
                      className="fx"
                      style={{ '--i': 2 } as CSSProperties}
                    />
                  )}
                  {(s.primary || s.secondary) && (
                    <div className="hero__cta fx" style={{ '--i': s.live ? 3 : 2 } as CSSProperties}>
                      {s.primary && <Cta link={s.primary} variant="gold" />}
                      {s.secondary && <Cta link={s.secondary} variant="ghost" />}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="hero__glow" aria-hidden="true" />
      <Snow />
      <div className="grain" aria-hidden="true" />

      {(rating || n > 1) && (
        <div className="hero__bottom">
          <div className="container hero__bottom-in">
            {rating}
            {n > 1 && (
              <div
                className="hnav"
                role="tablist"
                aria-label="Choisir une diapositive"
                data-n={n}
                style={{ '--n': n } as CSSProperties}
                onPointerEnter={() => setHovering(true)}
                onPointerLeave={() => setHovering(false)}
              >
                {slides.map((s, i) => (
                  <button
                    key={s.key}
                    ref={(el) => {
                      tabsRef.current[i] = el
                    }}
                    type="button"
                    role="tab"
                    aria-selected={i === cur}
                    aria-controls={slideId(i)}
                    tabIndex={i === cur ? 0 : -1}
                    onClick={() => go(i)}
                  >
                    <span className="bar" aria-hidden="true">
                      <i
                        onAnimationEnd={(e) => {
                          if (e.target === e.currentTarget && i === cur && !reduced) go(cur + 1)
                        }}
                      />
                    </span>
                    {s.thumb}
                    <span className="hnav__txt">
                      <small>{s.navLabel}</small>
                      <strong>{s.navTitle}</strong>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
