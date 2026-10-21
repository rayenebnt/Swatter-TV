'use client'
// « Ajouter à ma liste » sur les pages détail (vidéo, replay, info, agenda) : garde le contenu dans « Ma liste » du membre
// connecté ; hors connexion, lien vers la connexion avec retour sur la page.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { memberApi, useMemberHint } from '@/lib/members/browser'
import type { FavoriteKind } from '@/lib/members/shared'
import '@/styles/members-save.css'

type Props = {
  kind: FavoriteKind
  /** Identifiant numérique du document */
  id: number
  /** Titre du contenu (nom accessible du bouton) */
  title: string
  /** 'md' : même hauteur que les grands boutons voisins (50 px) ; 'sm' par défaut (42 px) */
  size?: 'sm' | 'md'
}

type Saved = { saved: boolean }
type Message = { text: string; error?: boolean }

/**
 * Les pages détail sont mises en cache : rendu serveur et hydratation en mode « non connecté » (lien), puis bouton
 * bascule si le cookie témoin est présent. État lu au montage (GET /api/compte/favoris), mise à jour optimiste au clic,
 * annulée en cas d'échec ; session expirée (401) : retour au lien de connexion.
 */
export function SaveButton({ kind, id, title, size = 'sm' }: Props) {
  const hint = useMemberHint()
  const pathname = usePathname()
  // 401 : mode « non connecté » même si le cookie témoin n'a pas encore disparu
  const [expired, setExpired] = useState(false)
  // Cookie témoin effacé (session expirée, déconnexion) : lui seul décide de nouveau (ajustement pendant le rendu)
  if (expired && !hint) setExpired(false)
  const member = hint && !expired
  const item = `${kind}:${id}`
  const [current, setCurrent] = useState({ item, member })
  // Contenu dans « Ma liste » ? null tant que la réponse n'est pas arrivée
  const [saved, setSaved] = useState<boolean | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const busy = useRef(false)
  const button = useRef<HTMLButtonElement>(null)
  const link = useRef<HTMLAnchorElement>(null)
  // Session expirée pendant que le bouton avait le focus : le focus passe au lien de connexion qui le remplace
  const refocus = useRef(false)

  // Autre contenu, ou connexion / déconnexion : état relu (ajustement pendant le rendu, sans effet). Le message reste
  // affiché quand seule la connexion change (« session expirée »).
  if (current.item !== item || current.member !== member) {
    if (current.item !== item) setMessage(null)
    setCurrent({ item, member })
    setSaved(null)
  }

  useEffect(() => {
    if (!member) return
    let cancelled = false
    memberApi<Saved>(`/favoris?kind=${kind}&id=${id}`).then((res) => {
      if (cancelled) return
      if (res.ok) setSaved(res.data.saved === true)
      else if (res.status === 401) setExpired(true)
      // État inconnu (réseau…) : le bouton reste utilisable, l'ajout ne crée jamais de doublon
      else setSaved(false)
    })
    return () => {
      cancelled = true
    }
  }, [member, kind, id])

  // Après chaque rendu : le lien de connexion a remplacé le bouton qui avait le focus (le cookie témoin peut disparaître
  // avant ou après la réponse traitée par toggle)
  useEffect(() => {
    if (!refocus.current || !link.current) return
    refocus.current = false
    link.current.focus()
  })

  // Retour discret : effacé après quelques secondes
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), message.error ? 8000 : 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function toggle() {
    if (busy.current || saved === null) return
    busy.current = true
    const focused = document.activeElement === button.current
    const next = !saved
    setSaved(next)
    setMessage(null)
    const res = next
      ? await memberApi<Saved>('/favoris', { method: 'POST', body: { kind, id } })
      : await memberApi<Saved>(`/favoris?kind=${kind}&id=${id}`, { method: 'DELETE' })
    busy.current = false
    if (res.ok) return setMessage({ text: next ? 'Ajouté à votre liste.' : 'Retiré de votre liste.' })
    setSaved(!next)
    setMessage({ text: res.error, error: true })
    if (res.status === 401) {
      // Focus encore sur le bouton, ou perdu parce que le bouton a déjà disparu
      const active = document.activeElement
      refocus.current = focused && (!active || active === document.body || active === button.current)
      setExpired(true)
    }
  }

  const className = `btn btn--ghost${size === 'sm' ? ' btn--sm' : ''} save__btn`
  const name = <span className="sr-only">&nbsp;: «&nbsp;{title}&nbsp;»</span>

  return (
    <div className="save">
      {member ? (
        <button
          ref={button}
          type="button"
          className={className}
          aria-pressed={saved === true}
          disabled={saved === null}
          title={saved ? 'Retirer de ma liste' : undefined}
          onClick={toggle}
        >
          <Icon name={saved ? 'bookmark-on' : 'bookmark'} />
          {saved ? 'Dans ma liste' : 'Ajouter à ma liste'}
          {name}
        </button>
      ) : (
        <Link
          ref={link}
          className={className}
          href={`/connexion?retour=${encodeURIComponent(pathname || '/')}`}
          title="Connectez-vous pour garder ce contenu"
          prefetch={false}
        >
          <Icon name="bookmark" />
          Ajouter à ma liste
          {name}
          <span className="sr-only"> (connexion requise)</span>
        </Link>
      )}
      {/* Zone d'annonce présente dès le premier rendu (y compris hors connexion : « session expirée ») */}
      <p className="save__msg" role="status">
        {message && <span className={message.error ? 'is-error' : undefined}>{message.text}</span>}
      </p>
    </div>
  )
}
