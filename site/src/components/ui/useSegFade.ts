'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Contrôle segmenté (.seg) plus large que son conteneur `wrap` : attributs data-fade-start / data-fade-end
 * (fondu CSS sur le bord qui cache des filtres) et, au montage, lien actif (aria-current) amené au centre.
 * `key` : relancer le calcul quand la liste change.
 */
export function useSegFade(wrapRef: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const wrap = wrapRef.current
    const seg = wrap?.querySelector<HTMLElement>('.seg')
    if (!wrap || !seg) return
    const update = () => {
      const hidden = seg.scrollWidth - seg.clientWidth
      wrap.toggleAttribute('data-fade-start', seg.scrollLeft > 4)
      wrap.toggleAttribute('data-fade-end', hidden - seg.scrollLeft > 4)
    }
    const active = seg.querySelector<HTMLElement>('[aria-current="page"]')
    if (active && seg.scrollWidth > seg.clientWidth + 2) seg.scrollLeft = active.offsetLeft - (seg.clientWidth - active.offsetWidth) / 2
    update()
    seg.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(seg)
    return () => {
      seg.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [wrapRef, key])
}
