'use client'
// Mot de passe oublié (POST /api/compte/mot-de-passe-oublie) : toujours le même message, que l'adresse ait un compte
// ou non (on ne révèle pas qui est inscrit).
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { memberApi } from '@/lib/members/browser'
import { checkEmail, normalizeEmail } from '@/lib/members/shared'
import { AuthNotice } from './AuthShell'
import { FieldError, fieldAttrs, fieldId, frenchSpaces, type Errors } from './Field'

type State = 'idle' | 'sending' | 'sent'

export function ForgotForm({ loginHref }: { loginHref: string }) {
  const [state, setState] = useState<State>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState('')
  const [email, setEmail] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const done = useRef<HTMLHeadingElement>(null)
  const again = useRef(false)
  const base = useId()

  useEffect(() => {
    if (state === 'sent') done.current?.focus()
    // « Faire une nouvelle demande » : le bouton disparaît, le focus va au champ e-mail
    if (state === 'idle' && again.current) {
      again.current = false
      input.current?.focus()
    }
  }, [state])

  function retry() {
    again.current = true
    setState('idle')
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    const address = normalizeEmail(new FormData(e.currentTarget).get('email'))
    const error = checkEmail(address)
    setErrors(error ? { email: error } : {})
    setFailure('')
    if (error) return input.current?.focus()
    setEmail(address)
    setState('sending')
    const res = await memberApi('/mot-de-passe-oublie', { body: { email: address } })
    if (res.ok) return setState('sent')
    setFailure(frenchSpaces(res.error))
    setState('idle')
  }

  if (state === 'sent') {
    return (
      <div className="contact-done auth-done">
        <span className="contact-done__icon" aria-hidden="true">
          <Icon name="mail" />
        </span>
        <h2 ref={done} tabIndex={-1}>
          Regardez votre messagerie
        </h2>
        <p role="status">
          Si un compte existe pour <strong className="auth-email">{email}</strong>, vous allez recevoir un lien pour choisir un nouveau mot de passe. Il est
          valable une heure et ne sert qu’une fois.
        </p>
        <ul className="auth-tips">
          <li>
            <Icon name="mail" /> Rien reçu d’ici quelques minutes&nbsp;? Regardez dans les courriers indésirables (spam).
          </li>
          <li>
            <Icon name="clock" /> Plusieurs demandes&nbsp;? Seul le lien du dernier e-mail reçu fonctionne.
          </li>
        </ul>
        <div className="auth-done__actions">
          <Link href={loginHref} className="btn btn--ghost btn--sm">
            <Icon name="left" />
            Retour à la connexion
          </Link>
          <button type="button" className="auth-linkbtn" onClick={retry}>
            Faire une nouvelle demande
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="contact-form auth-form" method="post" onSubmit={submit} noValidate>
      <div className="contact-field">
        <label htmlFor={fieldId(base, 'email')}>
          Adresse e-mail de votre compte <span aria-hidden="true">*</span>
        </label>
        <input
          ref={input}
          {...fieldAttrs(base, 'email', errors)}
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={email}
          required
          maxLength={200}
        />
        <FieldError base={base} name="email" errors={errors} />
      </div>

      {failure && (
        <AuthNotice tone="error">
          <p role="alert">{failure}</p>
        </AuthNotice>
      )}

      <button type="submit" className="btn btn--gold auth-submit" disabled={state === 'sending'}>
        <Icon name="mail" />
        {state === 'sending' ? 'Envoi en cours…' : 'Recevoir un lien'}
      </button>
    </form>
  )
}
