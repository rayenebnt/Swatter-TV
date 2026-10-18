'use client'
// Barre de chargement en haut de l'écran pendant un changement de page : le clic a un effet visible tout de suite, même
// quand la page suivante met un moment à arriver. Rien ne s'affiche si elle arrive en moins de 150 ms (cas courant).
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

const DELAY_MS = 150
/** Au-delà, la barre disparaît d'elle-même (navigation annulée, page ouverte dans un nouvel onglet…). */
const GIVE_UP_MS = 15_000

function Bar() {
  const pathname = usePathname()
  const here = `${pathname}?${useSearchParams().toString()}`
  // page quittée au clic (la barre se termine dès que l'adresse change) et barre visible après le délai
  const [pending, setPending] = useState<{ from: string; visible: boolean } | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      const loc = window.location
      if (url.origin !== loc.origin || (url.pathname === loc.pathname && url.search === loc.search)) return
      clear()
      const from = `${loc.pathname}?${loc.search.slice(1)}`
      setPending({ from, visible: false })
      timers.current.push(
        window.setTimeout(() => setPending((p) => (p && p.from === from ? { ...p, visible: true } : p)), DELAY_MS),
        window.setTimeout(() => setPending(null), GIVE_UP_MS),
      )
    }
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      clear()
    }
  }, [])

  const state = !pending ? 'idle' : pending.from !== here ? 'done' : pending.visible ? 'loading' : 'idle'
  return <div className={`nav-progress nav-progress--${state}`} aria-hidden="true" />
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  )
}
