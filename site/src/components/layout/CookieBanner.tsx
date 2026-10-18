'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { COOKIES_EVENT, readConsent, writeConsent, type CookiesEventDetail } from './consent'
import '@/styles/shell.css'

/** Délai d'apparition à la première visite (comme la maquette), pour laisser la page s'afficher. */
const FIRST_VISIT_DELAY = 1400

/**
 * Bandeau cookies conforme CNIL : Refuser, Personnaliser et Accepter présentés à égalité,
 * aucun traceur avant un choix, choix modifiable à tout moment (« Gestion des cookies »).
 * Rendu après montage seulement (rien dans le HTML serveur) ; ne bloque pas la navigation.
 * Contrat du stockage et des événements : voir ./consent.ts.
 */
export function CookieBanner() {
  const [state, setState] = useState<'closed' | 'open' | 'leaving'>('closed')
  const [expanded, setExpanded] = useState(false)
  const [audience, setAudience] = useState(false)
  const [externes, setExternes] = useState(false)
  /** Rouvert depuis « Gestion des cookies » : un choix existe déjà, Échap ferme sans rien changer */
  const [reopened, setReopened] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const wantFocus = useRef(false)
  const customizeRef = useRef<HTMLButtonElement>(null)
  const focusCustomize = useRef(false)
  const id = useId()

  // Première visite sans choix enregistré : affichage différé ; réouverture sur « swatter:cookies »
  useEffect(() => {
    const timer = readConsent() ? 0 : window.setTimeout(() => setState('open'), FIRST_VISIT_DELAY)
    const onReopen = (e: Event) => {
      window.clearTimeout(timer)
      const c = readConsent()
      const trigger = (e as CustomEvent<CookiesEventDetail | undefined>).detail?.trigger
      returnTo.current = trigger instanceof HTMLElement ? trigger : null
      wantFocus.current = true
      setAudience(c?.audience ?? false)
      setExternes(c?.externes ?? false)
      setReopened(Boolean(c))
      setExpanded(true)
      setState('open')
    }
    window.addEventListener(COOKIES_EVENT, onReopen)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(COOKIES_EVENT, onReopen)
    }
  }, [])

  // Panneau « Personnaliser » déplié à la demande : focus sur le premier interrupteur modifiable
  useEffect(() => {
    if (!expanded || state !== 'open' || !wantFocus.current) return
    wantFocus.current = false
    ref.current?.querySelector<HTMLElement>('input:not([disabled])')?.focus()
  }, [expanded, state])

  // Panneau replié au clavier (Échap) : le focus revient sur « Personnaliser » au lieu de tomber sur la page
  useEffect(() => {
    if (expanded || !focusCustomize.current) return
    focusCustomize.current = false
    customizeRef.current?.focus()
  }, [expanded])

  // Sortie : démontage après l'animation de fermeture
  useEffect(() => {
    if (state !== 'leaving') return
    const t = window.setTimeout(() => {
      setState('closed')
      setExpanded(false)
    }, 320)
    return () => window.clearTimeout(t)
  }, [state])

  if (state === 'closed') return null

  const close = () => {
    setState('leaving')
    const back = returnTo.current
    returnTo.current = null
    if (back?.isConnected && back.getClientRects().length) back.focus({ preventScroll: true })
  }
  const save = (choice: { audience: boolean; externes: boolean }) => {
    writeConsent(choice)
    close()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || state !== 'open') return
    // Ouvert depuis un bouton (pied de page, lecteur vidéo…) ou choix déjà enregistré : Échap ferme et rend le focus au déclencheur
    if (reopened || returnTo.current) close()
    // Bandeau de première visite déplié : Échap le replie
    else if (expanded) {
      focusCustomize.current = true
      setExpanded(false)
    }
  }

  const titleId = `${id}-title`
  const descId = `${id}-desc`

  return (
    <div
      ref={ref}
      className={`cookie${state === 'leaving' ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={onKeyDown}
    >
      <h2 className="cookie__title" id={titleId}>
        Vos choix cookies
      </h2>
      <p id={descId}>
        Nous utilisons des cookies pour mesurer l’audience et afficher les vidéos intégrées (YouTube, Twitch, Bunny). Vous pouvez changer d’avis à tout
        moment depuis «&nbsp;Gestion des cookies&nbsp;», en bas de page.
      </p>

      {expanded && (
        <ul className="cookie__opts" aria-label="Catégories de cookies">
          <CookieOption id={`${id}-req`} title="Fonctionnement du site" text="Mémorisation de vos choix. Indispensable, toujours actif." checked disabled />
          <CookieOption
            id={`${id}-aud`}
            title="Mesure d’audience"
            text="Statistiques de fréquentation pour améliorer nos programmes et le site."
            checked={audience}
            onChange={setAudience}
          />
          <CookieOption
            id={`${id}-ext`}
            title="Contenus externes"
            text="Lecture des vidéos YouTube, Twitch et Bunny, qui peuvent déposer leurs propres cookies."
            checked={externes}
            onChange={setExternes}
          />
        </ul>
      )}

      {/* Trois boutons de même apparence et de même taille (exigence CNIL) */}
      <div className="cookie__btns">
        <button className="btn btn--ghost" type="button" onClick={() => save({ audience: false, externes: false })}>
          {expanded ? 'Tout refuser' : 'Refuser'}
        </button>
        {expanded ? (
          <button className="btn btn--ghost" type="button" onClick={() => save({ audience, externes })}>
            Enregistrer
          </button>
        ) : (
          <button
            ref={customizeRef}
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              wantFocus.current = true
              setExpanded(true)
            }}
          >
            Personnaliser
          </button>
        )}
        <button className="btn btn--ghost" type="button" onClick={() => save({ audience: true, externes: true })}>
          {expanded ? 'Tout accepter' : 'Accepter'}
        </button>
      </div>
    </div>
  )
}

/** Catégorie de cookies avec interrupteur accessible (case à cocher role="switch"). */
function CookieOption({
  id,
  title,
  text,
  checked,
  disabled = false,
  onChange,
}: {
  id: string
  title: string
  text: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <li className="cookie__opt">
      <label htmlFor={id} className="cookie__opt-txt">
        <b id={`${id}-l`}>{title}</b>
        <small id={`${id}-d`}>{text}</small>
      </label>
      <span className="switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-labelledby={`${id}-l`}
          aria-describedby={`${id}-d`}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="switch__track" aria-hidden="true" />
      </span>
    </li>
  )
}
