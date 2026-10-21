// Pages publiques de l'espace membres (connexion, inscription, mot de passe) : carte centrée, colonne d'à-côté
// facultative, encadrés de message, et chemin de retour après connexion (?retour=).
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { isAuthPage, safeReturn } from '@/lib/members/shared'

/** Chemin de retour sûr lu dans ?retour= (une seule valeur), sinon `fallback`. */
export function authReturn(v: string | string[] | undefined, fallback = '/compte'): string {
  const path = safeReturn(Array.isArray(v) ? v[0] : v, fallback)
  return isAuthPage(path) ? fallback : path
}

/** Ajoute ?retour= à un lien de l'espace, sauf si le retour est l'espace lui-même (valeur par défaut). */
export const withReturn = (href: string, retour: string) => (retour && retour !== '/compte' ? `${href}?retour=${encodeURIComponent(retour)}` : href)

/** Première valeur d'un paramètre de recherche. */
export const firstParam = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** Mise en page : carte du formulaire, et à côté (ordinateur) ou dessous (mobile) une colonne d'informations. */
export function AuthShell({ children, aside, asideLabel }: { children: ReactNode; aside?: ReactNode; asideLabel?: string }) {
  return (
    <div className={`container section--tight auth-page${aside ? ' auth-page--aside' : ''}`}>
      <div className="auth-card">{children}</div>
      {aside && (
        <aside className="auth-aside" aria-label={asideLabel}>
          {aside}
        </aside>
      )}
    </div>
  )
}

type Tone = 'ok' | 'info' | 'warn' | 'error'
const TONE_ICON: Record<Tone, IconName> = { ok: 'check', info: 'mail', warn: 'clock', error: 'shield' }

/** Encadré de message (confirmation, information, avertissement, erreur). */
export function AuthNotice({
  tone = 'info',
  title,
  children,
  role,
  icon,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  role?: 'status' | 'alert'
  icon?: IconName
}) {
  return (
    <div className={`auth-note auth-note--${tone}`} role={role}>
      <Icon name={icon ?? TONE_ICON[tone]} className="auth-note__icon" />
      <div className="auth-note__body">
        {title && <p className="auth-note__title">{title}</p>}
        {children}
      </div>
    </div>
  )
}

/** Lien de bas de carte : « Pas encore de compte ? Créer un compte ». */
export function AuthSwitch({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <p className="auth-switch">
      {text}{' '}
      <Link href={href}>
        {label}
        <Icon name="arrow" />
      </Link>
    </p>
  )
}
