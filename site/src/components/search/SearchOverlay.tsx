'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { Icon, type IconName } from '@/components/ui/Icon'
import type { SearchHit } from '@/lib/search'
import { searchPageUrl, SUGGESTIONS } from './rubriques'
import { cleanQuery, highlightParts, queryWords } from './text'
import { fallbackVisual, isRemote } from './visuals'
import '@/styles/search.css'

const LIST_ID = 'search-list'
const HEAD_ID = 'search-head'
const optionId = (i: number) => `search-opt-${i}`
const FOCUSABLE = 'input, button:not([disabled]), a[href], [tabindex]'
/** Nombre de requêtes gardées en mémoire (retour arrière instantané). */
const MAX_CACHE = 30

type Item = { key: string; href: string; title: string; subtitle: string; label: string; image?: string; icon?: IconName; all?: boolean }

const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Réponse de /api/search vérifiée (données externes au composant). */
function readHits(data: unknown): SearchHit[] {
  const hits = typeof data === 'object' && data !== null ? (data as { hits?: unknown }).hits : null
  if (!Array.isArray(hits)) return []
  return hits.filter(
    (h): h is SearchHit =>
      typeof h === 'object' && h !== null && ['title', 'subtitle', 'href', 'typeLabel'].every((k) => typeof (h as Record<string, unknown>)[k] === 'string'),
  )
}

/** Ancre sur la page courante (ex. /programme-tv#emission) : on change l'ancre pour que la page réagisse (« hashchange »). */
function samePageHash(href: string): string | null {
  const url = new URL(href, window.location.href)
  return url.pathname === window.location.pathname && url.search === window.location.search && url.hash ? url.hash : null
}

function goToHash(hash: string) {
  if (window.location.hash === hash) history.replaceState(history.state, '', window.location.pathname + window.location.search)
  window.location.hash = hash
}

/**
 * Recherche instantanée plein écran (maquette : .search, .results). S'ouvre au clic sur tout élément [data-open-search]
 * (délégation) ou à la touche « / » ; Échap, clic sur le fond ou bouton pour fermer ; focus piégé et rendu à l'élément
 * d'origine ; défilement verrouillé ; résultats en liste d'options (↑ ↓ Entrée) ; fermeture au changement de page.
 */
export function SearchOverlay() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState(pathname)
  const [query, setQuery] = useState('')
  const [cache, setCache] = useState<Record<string, SearchHit[]>>({})
  const [failed, setFailed] = useState<string | null>(null)
  /** Dernière requête reçue : ses résultats restent affichés pendant le chargement de la suivante */
  const [shown, setShown] = useState('')
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef(true)
  const downOnBackdrop = useRef(false)

  // Changement de page : fermeture (ajustement d'état pendant le rendu, sans effet)
  if (path !== pathname) {
    setPath(pathname)
    setOpen(false)
  }

  const term = cleanQuery(query)
  const searching = term.length >= 2
  const hits = searching ? cache[term] : undefined
  const cached = hits !== undefined
  const error = searching && !cached && failed === term
  const loading = searching && !cached && !error
  const visible = hits ?? (loading ? cache[shown] : undefined) ?? []
  const words = queryWords(term)
  const noResult = cached && hits.length === 0

  const items: Item[] =
    searching && !noResult && !error
      ? [
          ...visible.map((h) => ({ key: `${h.type}:${h.href}`, href: h.href, title: h.title, subtitle: h.subtitle, label: h.typeLabel, image: h.image || fallbackVisual(h.href) })),
          ...(cached && hits.length ? [{ key: 'all', href: searchPageUrl(term), title: `Voir tous les résultats pour «\u00a0${term}\u00a0»`, subtitle: '', label: '', all: true }] : []),
        ]
      : SUGGESTIONS.map((r) => ({ key: r.href, href: r.href, title: r.label, subtitle: r.hint, label: 'Rubrique', icon: r.icon }))

  const head = searching && !noResult && !error ? 'Résultats' : 'Accès rapide'
  const announce = !open || !searching || loading ? '' : error ? 'La recherche est momentanément indisponible.' : hits?.length ? `${hits.length} résultat${hits.length > 1 ? 's' : ''}` : 'Aucun résultat'

  // Ouverture : clic sur tout élément [data-open-search] (délégation) ou touche « / » hors champ de saisie
  useEffect(() => {
    const openFrom = (origin: Element | null) => {
      if (rootRef.current?.classList.contains('is-open')) {
        inputRef.current?.focus()
        return
      }
      returnTo.current = origin instanceof HTMLElement && origin !== document.body ? origin : null
      restoreFocus.current = true
      // Rendu immédiat puis focus dans le même geste (sinon iOS n'affiche pas le clavier)
      flushSync(() => {
        setOpen(true)
        setFailed(null)
      })
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const trigger = e.target instanceof Element ? e.target.closest('[data-open-search]') : null
      if (!trigger) return
      e.preventDefault()
      openFrom(trigger)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented || isEditable(e.target)) return
      e.preventDefault()
      openFrom(document.activeElement)
    }
    // Phase de capture : passe avant le gestionnaire d'un lien Next (<Link data-open-search>), qui n'est alors pas suivi
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Panneau ouvert : défilement verrouillé, Échap, piège du focus ; à la fermeture, retour du focus
  useEffect(() => {
    const root = rootRef.current
    if (!open || !root) return
    const html = document.documentElement
    const scrollbar = window.innerWidth - html.clientWidth
    html.style.setProperty('--search-sb', `${Math.max(0, scrollbar)}px`)
    html.classList.add('search-lock')
    if (document.activeElement !== inputRef.current) inputRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        restoreFocus.current = true
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const list = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0)
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      const current = document.activeElement
      const inside = current instanceof Node && root.contains(current)
      if (e.shiftKey && (current === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      html.classList.remove('search-lock')
      html.style.removeProperty('--search-sb')
      const back = returnTo.current
      returnTo.current = null
      if (restoreFocus.current && back?.isConnected && back.getClientRects().length) back.focus({ preventScroll: true })
    }
  }, [open])

  // Requête : anti-rebond de 150 ms, annulation de la précédente, mise en mémoire des réponses
  useEffect(() => {
    if (!open || term.length < 2 || cached) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const list = readHits(await res.json())
        setCache((prev) => {
          const keys = Object.keys(prev)
          const kept = keys.length >= MAX_CACHE ? Object.fromEntries(keys.slice(keys.length - MAX_CACHE + 1).map((k) => [k, prev[k]])) : prev
          return { ...kept, [term]: list }
        })
        setShown(term)
        setActive(-1)
      } catch {
        if (!ctrl.signal.aborted) setFailed(term)
      }
    }, 150)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [open, term, cached])

  // Option active toujours visible dans la liste
  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = () => {
    restoreFocus.current = true
    setOpen(false)
  }

  /** Navigation vers un résultat : fermeture sans rendre le focus (la nouvelle page le prend). */
  const navigate = (href: string) => {
    restoreFocus.current = false
    setOpen(false)
    const hash = samePageHash(href)
    if (hash) goToHash(hash)
    else router.push(href)
  }

  const onPick = (e: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    // Ouverture dans un nouvel onglet : comportement natif du lien
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    restoreFocus.current = false
    setOpen(false)
    const hash = samePageHash(href)
    if (hash) {
      e.preventDefault()
      goToHash(hash)
    }
  }

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!items.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const item = items[active]
      if (item) navigate(item.href)
      else if (searching) navigate(searchPageUrl(term))
    }
  }

  return (
    <div
      ref={rootRef}
      className={`search${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Recherche"
      inert={!open}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) close()
      }}
    >
      <div className="search__box">
        <div className="search__field" onClick={(e) => e.target === e.currentTarget && inputRef.current?.focus()}>
          <Icon name="search" />
          <label className="sr-only" htmlFor="search-input">
            Rechercher sur Swatter TV
          </label>
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            role="combobox"
            aria-expanded={open && items.length > 0}
            aria-controls={items.length ? LIST_ID : undefined}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && active < items.length ? optionId(active) : undefined}
            placeholder="Émission, vidéo, info, sortie, webcam…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={80}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(-1)
              setFailed(null)
            }}
            onKeyDown={onInputKey}
          />
          {loading && <span className="search__spin" aria-hidden="true" />}
          <button type="button" className="search__close" aria-label="Fermer la recherche" onClick={close}>
            <kbd className="k">Échap</kbd>
            <Icon name="x" className="search__x" />
          </button>
        </div>

        <div className="results" aria-busy={loading}>
          {noResult && (
            <p className="results__msg">
              Aucun résultat pour «&nbsp;{term}&nbsp;»
            </p>
          )}
          {error && <p className="results__msg">La recherche est momentanément indisponible. Réessayez dans un instant.</p>}
          {loading && !visible.length && <p className="results__msg">Recherche en cours…</p>}
          {items.length > 0 && (
            <>
              <p className="results__head" id={HEAD_ID}>
                {head}
              </p>
              <div role="listbox" id={LIST_ID} aria-labelledby={HEAD_ID}>
                {items.map((it, i) => (
                  <Link
                    key={it.key}
                    id={optionId(i)}
                    href={it.href}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    prefetch={false}
                    className={[it.all ? 'results__all' : '', i === active ? 'is-hl' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={(e) => onPick(e, it.href)}
                  >
                    {it.all ? (
                      <>
                        {it.title}
                        <Icon name="arrow" />
                      </>
                    ) : (
                      <>
                        {it.image ? (
                          <Image src={it.image} alt="" width={92} height={52} unoptimized={isRemote(it.image)} />
                        ) : (
                          <span className="results__ico">{it.icon && <Icon name={it.icon} />}</span>
                        )}
                        <span>
                          <strong>
                            {highlightParts(it.title, words).map((p, j) => (p.hit ? <mark key={j}>{p.text}</mark> : p.text))}
                          </strong>
                          {it.subtitle && <small>{it.subtitle}</small>}
                        </span>
                        <span className="type">{it.label}</span>
                      </>
                    )}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  )
}
