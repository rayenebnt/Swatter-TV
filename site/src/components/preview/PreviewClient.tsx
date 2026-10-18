'use client'

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import '@/styles/preview.css'

const noSubscription = () => () => {}

/**
 * Mode aperçu, côté navigateur :
 * - dans l'aperçu en direct de l'administration (iframe) : la page se rafraîchit à chaque enregistrement automatique,
 *   et suit l'endroit modifié dans la fiche (page à ouvrir, élément vers lequel défiler, voir PreviewFocus) ;
 * - dans un onglet normal : bandeau « Aperçu » avec un lien pour revenir au site tel que le voient les visiteurs.
 */
export function PreviewClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // côté navigateur seulement : page affichée dans l'aperçu de l'administration (iframe) ou dans un onglet
  const frame = useSyncExternalStore(
    noSubscription,
    () => (window.self !== window.top ? 'embedded' : 'tab'),
    () => null,
  )

  useEffect(() => {
    // le bandeau cookies n'a pas sa place dans un aperçu
    document.documentElement.dataset.preview = ''
    return () => {
      delete document.documentElement.dataset.preview
    }
  }, [])

  if (!frame) return null
  if (frame === 'embedded')
    return (
      <>
        <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={window.location.origin} />
        <FocusFollower />
      </>
    )

  const query = searchParams.toString()
  const here = `${pathname}${query ? `?${query}` : ''}`
  return (
    <div className="preview-bar" role="status">
      <span className="preview-bar__dot" aria-hidden="true" />
      <span>
        <strong>Aperçu</strong> : vous voyez aussi les modifications pas encore publiées.
      </span>
      <a href={`/apercu/quitter?chemin=${encodeURIComponent(here)}`}>Voir le site comme les visiteurs</a>
    </div>
  )
}

/**
 * Centre l'élément dans l'aperçu. Pas de scrollIntoView : dans une iframe, il fait aussi défiler la page de
 * l'administration autour. Les conteneurs à défilement horizontal (grille des programmes) sont centrés aussi.
 */
function scrollToCenter(el: Element) {
  const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  for (let box = el.parentElement; box; box = box.parentElement) {
    if (box.scrollWidth > box.clientWidth && /(auto|scroll)/.test(getComputedStyle(box).overflowX)) {
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      box.scrollTo({ left: box.scrollLeft + r.left - b.left - (b.width - Math.min(r.width, b.width)) / 2, behavior })
    }
  }
  const r = el.getBoundingClientRect()
  window.scrollTo({ top: window.scrollY + r.top - (window.innerHeight - Math.min(r.height, window.innerHeight)) / 2, behavior })
}

/** Défile jusqu'à l'élément [data-preview~=target] et le surligne un instant (en réessayant tant que la page se charge). */
function reveal(target: string, attempt = 0) {
  const el = document.querySelector(`[data-preview~="${CSS.escape(target)}"]`)
  if (!el) {
    if (attempt < 20) window.setTimeout(() => reveal(target, attempt + 1), 150)
    return
  }
  scrollToCenter(el)
  el.classList.add('preview-focus')
  // dernier endroit montré (lu par les tests de bout en bout)
  document.documentElement.dataset.previewFocus = target
  window.setTimeout(() => el.classList.remove('preview-focus'), 2400)
}

/**
 * Reçoit de la fiche en cours de modification la page et l'endroit à montrer : change de page si besoin (le mode aperçu
 * suit la navigation), puis défile jusqu'à l'élément modifié.
 */
function FocusFollower() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const pending = useRef<string | null>(null)
  // dernier message traité : la fiche répond à chaque signal « prêt », un même endroit n'est montré qu'une fois
  const last = useRef('')

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; path?: unknown; target?: unknown } | null
      if (e.origin !== window.location.origin || e.source !== window.parent || data?.type !== 'swatter:preview-focus') return
      const target = typeof data.target === 'string' ? data.target : null
      const path = typeof data.path === 'string' && data.path.startsWith('/') && !data.path.startsWith('//') ? data.path : null
      const key = `${path}|${target}`
      if (key === last.current) return
      last.current = key
      const [page] = (path ?? '').split('#')
      if (page && page !== `${window.location.pathname}${window.location.search}`) {
        // l'élément sera cherché une fois la nouvelle page affichée
        pending.current = target
        router.push(path!, { scroll: !target })
      } else if (target) {
        reveal(target)
      }
    }
    window.addEventListener('message', onMessage)
    // signal « prêt » répété : la fiche peut finir de se charger après l'aperçu
    const ready = () => window.parent.postMessage({ type: 'swatter:preview-ready' }, window.location.origin)
    ready()
    const timers = [600, 1500, 3000].map((ms) => window.setTimeout(ready, ms))
    return () => {
      window.removeEventListener('message', onMessage)
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [router])

  useEffect(() => {
    if (!pending.current) return
    reveal(pending.current)
    pending.current = null
  }, [pathname, search])

  return null
}
