'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useOnAir } from '@/components/video/useOnAir'
import { isActive, type NavItem } from './nav'

/** Place un indicateur (pastille ou soulignement) sous un lien, à `inset` px des bords. */
function place(el: HTMLElement, target: HTMLElement, inset = 0) {
  el.style.width = `${Math.max(0, target.offsetWidth - inset * 2)}px`
  el.style.transform = `translateX(${target.offsetLeft + inset}px)`
}
const padX = (a: HTMLElement) => parseFloat(getComputedStyle(a).paddingLeft) || 0

/** Repos : soulignement sous la rubrique active, pastille masquée. */
function rest(root: HTMLElement) {
  const pill = root.querySelector<HTMLElement>('.nav__pill')
  const bar = root.querySelector<HTMLElement>('.nav__bar')
  if (!pill || !bar) return
  pill.style.opacity = '0'
  const a = root.querySelector<HTMLElement>('a[aria-current="page"]')
  if (a && a.offsetWidth) {
    place(bar, a, padX(a))
    bar.style.opacity = '1'
  } else bar.style.opacity = '0'
}

/** Navigation principale de l'en-tête (visible au-delà de 1100 px). */
export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const ref = useRef<HTMLElement>(null)
  // Point rouge de « Le Direct » : seulement à l'antenne (18 h – 0 h 30), jamais au rendu serveur (layout en cache)
  const onAir = useOnAir()

  // Survol : la pastille et le soulignement suivent le pointeur ; mise en page recalculée au redimensionnement
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const pill = root.querySelector<HTMLElement>('.nav__pill')
    const bar = root.querySelector<HTMLElement>('.nav__bar')
    const onEnter = (e: PointerEvent) => {
      const a = e.target instanceof Element ? e.target.closest<HTMLElement>('a') : null
      if (!a || !pill || !bar) return
      place(pill, a)
      pill.style.opacity = '1'
      place(bar, a, padX(a))
      bar.style.opacity = '1'
    }
    const onLeave = () => rest(root)
    const links = [...root.querySelectorAll<HTMLElement>('a')]
    links.forEach((a) => a.addEventListener('pointerenter', onEnter))
    root.addEventListener('pointerleave', onLeave)
    const ro = new ResizeObserver(() => rest(root))
    ro.observe(root)
    let alive = true
    document.fonts?.ready
      .then(() => {
        if (alive) rest(root)
      })
      .catch(() => {})
    return () => {
      alive = false
      links.forEach((a) => a.removeEventListener('pointerenter', onEnter))
      root.removeEventListener('pointerleave', onLeave)
      ro.disconnect()
    }
  }, [])

  // Changement de page : le soulignement glisse vers la nouvelle rubrique (sans animation au premier placement)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    rest(root)
    const raf = requestAnimationFrame(() => root.classList.add('is-ready'))
    return () => cancelAnimationFrame(raf)
  }, [pathname])

  // Point rouge apparu ou retiré (bascule de 18 h / 0 h 30) : les liens suivants se décalent, le soulignement les suit
  useEffect(() => {
    if (ref.current) rest(ref.current)
  }, [onAir])

  return (
    <nav ref={ref} className="nav" aria-label="Navigation principale">
      <span className="nav__pill" aria-hidden="true" />
      <span className="nav__bar" aria-hidden="true" />
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? 'page' : undefined}>
          {it.live && onAir && <span className="dot-live" aria-hidden="true" />}
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
