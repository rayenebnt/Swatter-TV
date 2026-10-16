'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Rail horizontal : défilement au doigt, à la molette, glisser à la souris.
 * Les flèches (RailArrows) se placent n'importe où et ciblent le rail par son `id`.
 */
export function Rail({ id, className = '', children, label }: { id: string; className?: string; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let down = false
    let moved = false
    let x0 = 0
    let s0 = 0
    let pointerId = 0
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      x0 = e.clientX
      s0 = el.scrollLeft
      pointerId = e.pointerId
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - x0
      if (!moved && Math.abs(dx) > 6) {
        moved = true
        el.classList.add('is-drag')
        el.setPointerCapture(pointerId)
      }
      if (moved) el.scrollLeft = s0 - dx
    }
    const onUp = () => {
      if (!down) return
      down = false
      if (moved) {
        el.classList.remove('is-drag')
        try {
          el.releasePointerCapture(pointerId)
        } catch {
          /* déjà relâché */
        }
        setTimeout(() => (moved = false), 0)
      }
    }
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onDragStart = (e: DragEvent) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClick, true)
    el.addEventListener('dragstart', onDragStart)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('dragstart', onDragStart)
    }
  }, [])

  return (
    <div ref={ref} id={id} className={`rail ${className}`} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}

/** Flèches précédent / suivant d'un rail (désactivées aux extrémités). */
export function RailArrows({ target }: { target: string }) {
  const [state, setState] = useState({ prev: false, next: true })

  const update = useCallback(() => {
    const el = document.getElementById(target)
    if (!el) return
    setState({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [target])

  useEffect(() => {
    const el = document.getElementById(target)
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [target, update])

  const go = (dir: number) => {
    const el = document.getElementById(target)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="arrows">
      <button className="icon-btn" type="button" aria-label="Précédent" disabled={!state.prev} onClick={() => go(-1)}>
        <Icon name="left" className="ico" />
      </button>
      <button className="icon-btn" type="button" aria-label="Suivant" disabled={!state.next} onClick={() => go(1)}>
        <Icon name="right" className="ico" />
      </button>
    </div>
  )
}
