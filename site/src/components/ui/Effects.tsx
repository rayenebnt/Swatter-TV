'use client'

import { useEffect } from 'react'

/**
 * Effets globaux légers, montés une seule fois dans le layout :
 * - révélation au défilement des éléments [data-reveal] (y compris ajoutés plus tard) ;
 * - halo doré qui suit la souris sur les cartes (.card, .tile), uniquement avec une souris.
 */
export function Effects() {
  useEffect(() => {
    document.documentElement.classList.remove('no-js')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const seen = new WeakSet<Element>()
    const io = reduce
      ? null
      : new IntersectionObserver(
          (entries) =>
            entries.forEach((en) => {
              if (en.isIntersecting) {
                en.target.classList.add('is-in')
                io?.unobserve(en.target)
              }
            }),
          { rootMargin: '0px 0px -8% 0px' },
        )
    const scan = (root: ParentNode) => {
      root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        if (io) io.observe(el)
        else el.classList.add('is-in')
      })
    }
    scan(document)
    const mo = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => n instanceof Element && scan(n.parentNode ?? n))))
    mo.observe(document.body, { childList: true, subtree: true })

    let raf = 0
    let last: PointerEvent | null = null
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const onMove = (e: PointerEvent) => {
      last = e
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const t = last?.target
        const card = t instanceof Element ? t.closest<HTMLElement>('.card, .tile') : null
        if (!card || !last) return
        const r = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${last.clientX - r.left}px`)
        card.style.setProperty('--my', `${last.clientY - r.top}px`)
      })
    }
    if (fine) document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      io?.disconnect()
      mo.disconnect()
      document.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])
  return null
}
