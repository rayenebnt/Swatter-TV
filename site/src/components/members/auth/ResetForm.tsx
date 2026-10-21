'use client'
// Nouveau mot de passe depuis le lien reçu par e-mail (POST /api/compte/nouveau-mot-de-passe) : saisie et confirmation
// vérifiées dans le navigateur ; en cas de succès le membre est connecté et arrive dans son espace.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { memberApi, notifyMemberChange } from '@/lib/members/browser'
import { MIN_PASSWORD, checkPassword } from '@/lib/members/shared'
import { AuthNotice } from './AuthShell'
import { focusFirstError, frenchSpaces, type Errors } from './Field'
import { PasswordField } from './PasswordField'

type State = 'idle' | 'sending' | 'done' | 'invalid'

/** Lien expiré, déjà utilisé ou incomplet : message et nouvelle demande. */
export function ResetInvalid({ title = 'Ce lien n’est plus valable.', message }: { title?: string; message?: string }) {
  return (
    <AuthNotice tone="warn" title={title}>
      <p>
        {message || 'Le lien pour choisir un nouveau mot de passe sert une seule fois, pendant une heure. Faites une nouvelle demande\u00a0: c’est immédiat.'}
      </p>
      <Link href="/mot-de-passe-oublie" className="auth-note__link">
        Recevoir un nouveau lien
        <Icon name="arrow" />
      </Link>
    </AuthNotice>
  )
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const status = useRef<HTMLDivElement>(null)
  const base = useId()

  useEffect(() => {
    if (state === 'invalid') status.current?.focus()
  }, [state])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending' || state === 'done') return
    const fd = new FormData(e.currentTarget)
    const password = String(fd.get('password') ?? '')
    const confirm = String(fd.get('confirm') ?? '')
    const errs: Errors = {}
    const pwdError = checkPassword(password)
    if (pwdError) errs.password = pwdError
    else if (confirm !== password) errs.confirm = 'Les deux mots de passe ne sont pas identiques.'
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return focusFirstError(form.current, errs)

    setState('sending')
    const res = await memberApi<{ ok: boolean; firstName: string }>('/nouveau-mot-de-passe', { body: { token, password } })
    if (res.ok) {
      setState('done')
      notifyMemberChange()
      router.replace('/compte')
      router.refresh()
      return
    }
    // lien expiré ou déjà servi : message de ResetInvalid (celui de l'API répète son titre)
    if (res.code === 'invalid') return setState('invalid')
    if (res.errors) {
      setErrors(res.errors)
      focusFirstError(form.current, res.errors)
    } else setFailure(frenchSpaces(res.error))
    setState('idle')
  }

  if (state === 'invalid') {
    return (
      <div ref={status} tabIndex={-1} className="auth-focus" role="alert">
        <ResetInvalid />
      </div>
    )
  }

  return (
    <form ref={form} className="contact-form auth-form" onSubmit={submit} noValidate>
      <PasswordField
        base={base}
        name="password"
        label="Nouveau mot de passe"
        autoComplete="new-password"
        errors={errors}
        hint={`${MIN_PASSWORD} caractères minimum. Une courte phrase est facile à retenir et difficile à deviner.`}
      />
      <PasswordField base={base} name="confirm" label="Confirmez le nouveau mot de passe" autoComplete="new-password" errors={errors} />

      {failure && (
        <AuthNotice tone="error">
          <p role="alert">{failure}</p>
        </AuthNotice>
      )}
      {state === 'done' && (
        <AuthNotice tone="ok">
          <p role="status">Mot de passe enregistré. Ouverture de votre espace…</p>
        </AuthNotice>
      )}

      <button type="submit" className="btn btn--gold auth-submit" disabled={state === 'sending' || state === 'done'}>
        <Icon name="check" />
        {state === 'sending' ? 'Enregistrement…' : 'Enregistrer et me connecter'}
      </button>
      <p className="contact-hint">Pour votre sécurité, vos autres appareils seront déconnectés.</p>
    </form>
  )
}
