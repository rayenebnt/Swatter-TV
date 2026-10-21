'use client'
// Renvoi de l'e-mail de confirmation d'inscription (POST /api/compte/renvoyer-confirmation) : un simple bouton quand
// l'adresse est connue (après l'inscription, ou une connexion refusée faute de confirmation), sinon un petit formulaire.
import { useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { memberApi } from '@/lib/members/browser'
import { checkEmail, normalizeEmail } from '@/lib/members/shared'
import { FieldError, fieldAttrs, frenchSpaces, type Errors } from './Field'

type State = 'idle' | 'sending' | 'sent'

// la réponse est la même que l'adresse attende une confirmation ou non : le message reste prudent
const SENT =
  'C’est fait\u00a0: si cette adresse attend encore sa confirmation, un nouveau lien, valable 48\u00a0h, vient de partir. Seul le lien du dernier e-mail reçu fonctionne.'

export function ResendConfirmation({
  email,
  defaultEmail,
  label = 'Renvoyer l’e-mail de confirmation',
}: {
  /** Adresse connue : bouton seul. Sinon, un champ e-mail est affiché. */
  email?: string
  /** Pré-remplissage du champ e-mail (sans adresse connue). */
  defaultEmail?: string
  label?: string
}) {
  const [state, setState] = useState<State>('idle')
  const [failure, setFailure] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const input = useRef<HTMLInputElement>(null)
  const base = useId()

  async function send(address: string) {
    setState('sending')
    setFailure('')
    const res = await memberApi('/renvoyer-confirmation', { body: { email: address } })
    if (res.ok) return setState('sent')
    setFailure(frenchSpaces(res.error))
    setState('idle')
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const address = normalizeEmail(new FormData(e.currentTarget).get('email'))
    const error = checkEmail(address)
    setErrors(error ? { email: error } : {})
    if (error) return input.current?.focus()
    void send(address)
  }

  const button = (
    <button
      type={email ? 'button' : 'submit'}
      className="btn btn--ghost btn--sm"
      disabled={state === 'sending'}
      onClick={email ? () => void send(email) : undefined}
    >
      <Icon name="mail" />
      {state === 'sending' ? 'Envoi en cours…' : state === 'sent' ? 'Renvoyer à nouveau' : label}
    </button>
  )
  const feedback = (
    <>
      <p className="auth-live" role="status">
        {state === 'sent' ? SENT : ''}
      </p>
      {failure && (
        <p className="contact-err" role="alert">
          {failure}
        </p>
      )}
    </>
  )

  if (email) {
    return (
      <div className="auth-resend">
        {button}
        {feedback}
      </div>
    )
  }
  return (
    <form className="auth-resend auth-resend--form" method="post" onSubmit={submit} noValidate>
      <div className="contact-field">
        <label htmlFor={`${base}-email`}>Adresse e-mail de votre compte</label>
        <input
          ref={input}
          {...fieldAttrs(base, 'email', errors)}
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
          maxLength={200}
        />
        <FieldError base={base} name="email" errors={errors} />
      </div>
      {button}
      {feedback}
    </form>
  )
}
