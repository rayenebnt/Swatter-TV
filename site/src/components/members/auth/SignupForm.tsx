'use client'
// Formulaire d'inscription à l'espace membres (POST /api/compte/inscription) : prénom, e-mail et mot de passe, vérification
// immédiate (checkSignup), champ piège et délai contre les robots. Le compte est actif aussitôt : le membre est connecté
// et arrive sur la page demandée (?retour=, sinon « Mon espace »). Aussi l'écran « inscriptions fermées » (réglage du
// site, ou refus de l'API si l'équipe vient de les fermer).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { memberApi, notifyMemberChange } from '@/lib/members/browser'
import { MIN_PASSWORD, checkSignup, safeReturn } from '@/lib/members/shared'
import { AuthNotice } from './AuthShell'
import { FieldError, fieldAttrs, fieldId, focusFirstError, frenchSpaces, type Errors } from './Field'
import { PasswordField } from './PasswordField'

type State = 'idle' | 'sending' | 'done' | 'closed'
/** Le serveur ignore poliment un envoi fait moins de 3 s après l'affichage (robot) : un humain rapide attend un peu. */
const MIN_DELAY = 3200

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Inscriptions fermées. `announce` : l'écran remplace le formulaire après un envoi (focus sur le titre et annonce). */
export function SignupClosed({ announce = false }: { announce?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (announce) heading.current?.focus()
  }, [announce])
  return (
    <div className="contact-done auth-done">
      <span className="contact-done__icon" aria-hidden="true">
        <Icon name="clock" />
      </span>
      <h2 ref={heading} tabIndex={-1}>
        Inscriptions momentanément fermées
      </h2>
      <p role={announce ? 'status' : undefined}>
        L’espace membres n’accepte pas de nouveaux comptes pour le moment&nbsp;: revenez bientôt. Vous avez déjà un compte&nbsp;? La connexion reste ouverte.
      </p>
    </div>
  )
}

/**
 * Formulaire d'inscription. Le serveur écarte en silence les envois de moins de 3 s après l'affichage (robots) : la durée
 * `elapsed` est mesurée ici, dans le navigateur, et ne dépend donc pas de l'heure de l'ordinateur du visiteur.
 */
export function SignupForm({ retour }: { retour: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState('')
  const form = useRef<HTMLFormElement>(null)
  // affichage du formulaire, horloge du navigateur (délai d'attente avant l'envoi)
  const mountedAt = useRef(0)
  const base = useId()

  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending' || state === 'done') return
    const fd = new FormData(e.currentTarget)
    const { data, errors: errs } = checkSignup(Object.fromEntries(fd.entries()))
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return focusFirstError(form.current, errs)

    setState('sending')
    const elapsed = Date.now() - mountedAt.current
    if (elapsed < MIN_DELAY) await wait(MIN_DELAY - elapsed)
    const res = await memberApi('/inscription', { body: { ...data, website: String(fd.get('website') ?? ''), elapsed: Date.now() - mountedAt.current } })
    if (res.ok) {
      // compte créé et connecté : le bouton reste « Création du compte… » pendant le changement de page
      setState('done')
      notifyMemberChange()
      router.replace(safeReturn(retour))
      router.refresh()
      return
    }
    if (res.code === 'closed') return setState('closed')
    if (res.errors) {
      setErrors(res.errors)
      focusFirstError(form.current, res.errors)
    } else setFailure(frenchSpaces(res.error))
    setState('idle')
  }

  if (state === 'closed') return <SignupClosed announce />

  const busy = state === 'sending' || state === 'done'
  // method="post" : envoyé avant le chargement des scripts, le formulaire ne met pas le mot de passe dans l'adresse
  return (
    <>
      <h2 className="auth-title">Vos informations</h2>
      <form ref={form} className="contact-form auth-form" method="post" onSubmit={submit} noValidate>
        <div className="contact-field">
          <label htmlFor={fieldId(base, 'firstName')}>
            Prénom <span aria-hidden="true">*</span>
          </label>
          <input {...fieldAttrs(base, 'firstName', errors)} type="text" autoComplete="given-name" required maxLength={60} />
          <FieldError base={base} name="firstName" errors={errors} />
        </div>

        <div className="contact-field">
          <label htmlFor={fieldId(base, 'email')}>
            E-mail <span aria-hidden="true">*</span>
          </label>
          <input {...fieldAttrs(base, 'email', errors)} type="email" inputMode="email" autoComplete="email" required maxLength={200} />
          <FieldError base={base} name="email" errors={errors} />
        </div>

        <PasswordField
          base={base}
          name="password"
          label="Mot de passe"
          autoComplete="new-password"
          errors={errors}
          hint={`${MIN_PASSWORD} caractères minimum. Une courte phrase est facile à retenir et difficile à deviner.`}
        />

        {/* champ piège invisible : seuls les robots le remplissent */}
        <div className="contact-trap" aria-hidden="true">
          <label htmlFor={fieldId(base, 'website')}>Ne pas remplir</label>
          <input id={fieldId(base, 'website')} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {failure && (
          <AuthNotice tone="error">
            <p role="alert">{failure}</p>
          </AuthNotice>
        )}

        <div className="auth-submit-row">
          <button type="submit" className="btn btn--gold auth-submit" disabled={busy}>
            <Icon name="user" />
            {busy ? 'Création du compte…' : 'Créer mon compte'}
          </button>
          <p className="contact-hint">
            En créant votre compte, vous acceptez la <Link href="/vie-privee">politique de confidentialité</Link> de Swatter TV Info.
          </p>
        </div>
      </form>
    </>
  )
}
