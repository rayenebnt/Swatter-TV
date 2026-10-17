'use client'

import { useEffect, useSyncExternalStore, type RefObject } from 'react'

/* ----- Horloge partagée : null au premier rendu (serveur et hydratation), puis l'heure courante toutes les 30 s ----- */
const STEP = 30_000
let now = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  now = Date.now()
  listeners.forEach((l) => l())
}

function start() {
  if (timer === undefined && !document.hidden) timer = setInterval(tick, STEP)
}

function stop() {
  clearInterval(timer)
  timer = undefined
}

// Onglet caché : horloge suspendue ; à son retour, heure rafraîchie aussitôt
function onVisibility() {
  if (document.hidden) stop()
  else {
    tick()
    start()
  }
}

function subscribeClock(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    document.addEventListener('visibilitychange', onVisibility)
    start()
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }
}

const clockSnapshot = () => now || (now = Date.now())
const noSnapshot = () => null

/** Heure courante (ms), ou null tant que le composant n'est pas hydraté. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(subscribeClock, clockSnapshot, noSnapshot)
}

/* ----- Ancre de l'adresse (#slug d'une émission, voir programUrl) : chaîne vide au premier rendu ----- */
function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

function hashSnapshot() {
  const raw = window.location.hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function useHash(): string {
  return useSyncExternalStore(subscribeHash, hashSnapshot, () => '')
}

/* ----- Gestes de la frise ----- */
/**
 * - glisser à la souris (le clic qui termine un glissement est annulé) ;
 * - molette verticale convertie en défilement horizontal, sauf si le geste a commencé hors de la grille
 *   (défilement de la page en cours) ou si la frise est en butée : la page n'est jamais piégée ;
 * - dégradés latéraux masqués en butée, animations en pause hors écran, position conservée au changement d'échelle.
 * Le tactile et le pavé tactile utilisent le défilement natif.
 */
export function useGridGestures(
  scrollerRef: RefObject<HTMLDivElement | null>,
  wrapRef: RefObject<HTMLDivElement | null>,
  gridRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const el = scrollerRef.current
    const wrap = wrapRef.current
    const grid = gridRef.current
    if (!el || !wrap || !grid) return

    // Dégradés de bord
    let raf = 0
    const edges = () => {
      raf = 0
      wrap.toggleAttribute('data-at-start', el.scrollLeft <= 4)
      wrap.toggleAttribute('data-at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(edges)
    }
    edges()

    // Glisser à la souris
    let down = false
    let moved = false
    let x0 = 0
    let s0 = 0
    let pointer = 0
    let unlock: ReturnType<typeof setTimeout> | undefined
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      x0 = e.clientX
      s0 = el.scrollLeft
      pointer = e.pointerId
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - x0
      if (!moved && Math.abs(dx) > 6) {
        moved = true
        el.classList.add('is-drag')
        el.setPointerCapture(pointer)
      }
      if (moved) el.scrollLeft = s0 - dx
    }
    const onUp = () => {
      if (!down) return
      down = false
      if (!moved) return
      el.classList.remove('is-drag')
      try {
        el.releasePointerCapture(pointer)
      } catch {
        // capture déjà relâchée
      }
      unlock = setTimeout(() => (moved = false), 0)
    }
    const onClick = (e: MouseEvent) => {
      if (!moved) return
      e.preventDefault()
      e.stopPropagation()
    }
    const onDragStart = (e: DragEvent) => e.preventDefault()

    // Molette
    let last = -Infinity
    let passing = false
    const onPageWheel = (e: WheelEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) return
      last = e.timeStamp
      passing = true
    }
    const onWheel = (e: WheelEvent) => {
      const fresh = e.timeStamp - last > 300
      last = e.timeStamp
      if (fresh) passing = false
      if (passing || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 1)) {
        passing = true
        return
      }
      e.preventDefault()
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? el.clientWidth : 1)
    }

    // Pause des animations (pastille « En cours ») hors écran
    const io = new IntersectionObserver(([en]) => wrap.toggleAttribute('data-paused', !en.isIntersecting))
    io.observe(wrap)

    // Changement d'échelle (seuil de 760 px) : même heure à l'écran
    let width = grid.offsetWidth
    const ro = new ResizeObserver(() => {
      const w = grid.offsetWidth
      if (w && width && w !== width) el.scrollLeft = el.scrollLeft * (w / width)
      width = w
      onScroll()
    })
    ro.observe(grid)

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClick, true)
    el.addEventListener('dragstart', onDragStart)
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('wheel', onPageWheel, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(unlock)
      io.disconnect()
      ro.disconnect()
      el.classList.remove('is-drag')
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('dragstart', onDragStart)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('wheel', onPageWheel)
    }
  }, [scrollerRef, wrapRef, gridRef])
}
