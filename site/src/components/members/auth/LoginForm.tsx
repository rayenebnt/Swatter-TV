'use client'
// Formulaire de connexion à l'espace membres (POST /api/compte/connexion) : vérification immédiate, messages selon le
// refus (identifiants, adresse non confirmée, compte bloqué ou suspendu), puis retour vers la page demandée.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { hasMemberHint, memberApi, notifyMemberChange } from '@/lib/members/browser'
import { checkEmail, normalizeEmail, safeReturn } from '@/lib/members/shared'
import { AuthNotice } from './AuthShell'
import { FieldError, fieldAttrs, focusFirstError, frenchSpaces, type Errors } from './Field'
import { PasswordField } from './PasswordField'
import { ResendConfirmation } from './ResendConfirmation'

type Failure = { message: string; code?: string; email: string }

export function LoginForm({ retour, email = '', forgotHref }: { retour: string; email?: string; forgotHref: string }) {
  const router = useRouter()
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<Failure | null>(null)
  const [sending, setSending] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const base = useId()

  // Cette page ne s'affiche qu'à défaut de session valide : un cookie témoin encore présent (session fermée depuis un autre
  // appareil, compte suspendu…) est périmé. La réponse 401 de /moi l'efface et l'en-tête repasse à « Se connecter ».
  useEffect(() => {
    if (hasMemberHint()) void memberApi('/moi')
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sending) return
    const fd = new FormData(e.currentTarget)
    const address = normalizeEmail(fd.get('email'))
    const password = String(fd.get('password') ?? '')
    const errs: Errors = {}
    const emailError = checkEmail(address)
    if (emailError) errs.email = emailError
    if (!password) errs.password = 'Indiquez votre mot de passe.'
    setErrors(errs)
    setFailure(null)
    if (Object.keys(errs).length) return focusFirstError(form.current, errs)

    setSending(true)
    const res = await memberApi<{ ok: boolean; firstName: string }>('/connexion', { body: { email: address, password } })
    if (res.ok) {
      // le bouton reste « Connexion… » pendant le changement de page
      notifyMemberChange()
      router.replace(safeReturn(retour))
      router.refresh()
      return
    }
    setSending(false)
    if (res.errors) {
      setErrors(res.errors)
      focusFirstError(form.current, res.errors)
    }
    setFailure({ message: frenchSpaces(res.error), code: res.code, email: address })
  }

  // method="post" : envoyé avant le chargement des scripts, le formulaire ne met pas le mot de passe dans l'adresse
  return (
    <form ref={form} className="contact-form auth-form" method="post" onSubmit={submit} noValidate>
      <div className="contact-field">
        <label htmlFor={`${base}-email`}>
          E-mail <span aria-hidden="true">*</span>
        </label>
        <input {...fieldAttrs(base, 'email', errors)} type="email" inputMode="email" autoComplete="username" defaultValue={email} required maxLength={200} />
        <FieldError base={base} name="email" errors={errors} />
      </div>

      <div className="auth-pass-group">
        <PasswordField base={base} name="password" label="Mot de passe" autoComplete="current-password" errors={errors} />
        <p className="auth-forgot">
          <Link href={forgotHref}>Mot de passe oublié&nbsp;?</Link>
        </p>
      </div>

      {failure && (
        <AuthNotice tone={failure.code === 'unverified' ? 'warn' : 'error'} icon={failure.code === 'unverified' ? 'mail' : undefined}>
          <p role="alert">{failure.message}</p>
          {failure.code === 'unverified' && <ResendConfirmation email={failure.email} />}
          {failure.code === 'locked' && (
            <Link href={forgotHref} className="auth-note__link">
              Choisir un nouveau mot de passe
              <Icon name="arrow" />
            </Link>
          )}
          {failure.code === 'blocked' && (
            <Link href="/contact" className="auth-note__link">
              Écrire à Swatter TV
              <Icon name="arrow" />
            </Link>
          )}
        </AuthNotice>
      )}

      <button type="submit" className="btn btn--gold auth-submit" disabled={sending}>
        <Icon name="user" />
        {sending ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
