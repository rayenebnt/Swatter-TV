'use client'
// « Mon espace » : changement de mot de passe (actuel + nouveau) → POST /api/compte/mot-de-passe ; les autres appareils
// sont déconnectés, celui-ci reste connecté (nouveau cookie de session).
import { useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { checkPassword, MIN_PASSWORD, type FieldErrors } from '@/lib/members/shared'
import { PasswordInput } from './PasswordInput'
import { useSpaceApi } from './useSpaceApi'

type Field = 'current' | 'password'

export function PasswordForm({ email }: { email: string }) {
  const call = useSpaceApi()
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  const focusFirstError = (errs: FieldErrors) => {
    const first = Object.keys(errs)[0]
    if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const el = e.currentTarget
    const fd = new FormData(el)
    const current = String(fd.get('current') ?? '')
    const password = String(fd.get('password') ?? '')
    const errs: FieldErrors = {}
    if (!current) errs.current = 'Indiquez votre mot de passe actuel.'
    const pwd = checkPassword(password)
    if (pwd) errs.password = pwd
    else if (password === current) errs.password = 'Choisissez un mot de passe différent de l’actuel.'
    setErrors(errs)
    setFailure('')
    setStatus('')
    if (Object.keys(errs).length) return focusFirstError(errs)
    setSending(true)
    const res = await call('/mot-de-passe', { body: { current, password } })
    setSending(false)
    if (res.ok) {
      el.reset()
      setStatus('Votre mot de passe a été changé. Vos autres appareils ont été déconnectés ; celui-ci reste connecté.')
    } else if (res.errors) {
      setErrors(res.errors)
      focusFirstError(res.errors)
    } else if (res.status !== 401) setFailure(res.error)
  }

  const field = (name: Field, hint = false) => ({
    name,
    id: `${id}-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': [errors[name] ? `${id}-${name}-err` : null, hint ? `${id}-${name}-hint` : null].filter(Boolean).join(' ') || undefined,
  })
  const error = (name: Field) =>
    errors[name] ? (
      <p className="contact-err" id={`${id}-${name}-err`}>
        {errors[name]}
      </p>
    ) : null

  return (
    <form ref={form} className="contact-form space-form" method="post" onSubmit={submit} noValidate>
      {/* identifiant du compte pour les gestionnaires de mots de passe (non modifiable ici) */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="contact-field">
        <label htmlFor={`${id}-current`}>Mot de passe actuel</label>
        <PasswordInput {...field('current')} autoComplete="current-password" required maxLength={200} />
        {error('current')}
      </div>
      <div className="contact-field">
        <label htmlFor={`${id}-password`}>Nouveau mot de passe</label>
        <PasswordInput {...field('password', true)} autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={200} />
        <p className="contact-hint" id={`${id}-password-hint`}>
          Au moins {MIN_PASSWORD} caractères. Une phrase facile à retenir fait un excellent mot de passe.
        </p>
        {error('password')}
      </div>

      <p className="space-status" role="status">
        {status}
      </p>
      {failure && (
        <p className="contact-err contact-err--global" role="alert">
          {failure}
        </p>
      )}

      <div className="contact-actions">
        <button type="submit" className="btn btn--gold btn--sm" disabled={sending}>
          <Icon name="shield" />
          {sending ? 'Modification…' : 'Changer le mot de passe'}
        </button>
      </div>
    </form>
  )
}
