'use client'
// Formulaire d'inscription à l'espace membres (POST /api/compte/inscription) : vérification immédiate (checkSignup),
// champ piège et heure d'affichage contre les robots, puis écran « confirmez votre adresse » avec renvoi de l'e-mail.
// Aussi l'écran « inscriptions fermées » (réglage du site, ou refus de l'API si l'équipe vient de les fermer).
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DEPARTMENTS } from '@/lib/departments'
import { memberApi } from '@/lib/members/browser'
import { MIN_PASSWORD, checkSignup, type SignupInput } from '@/lib/members/shared'
import { AuthNotice } from './AuthShell'
import { FieldError, fieldAttrs, fieldId, focusFirstError, frenchSpaces, type Errors } from './Field'
import { PasswordField } from './PasswordField'
import { ResendConfirmation } from './ResendConfirmation'

type State = 'idle' | 'sending' | 'sent' | 'closed'
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
export function SignupForm() {
  const [state, setState] = useState<State>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState('')
  // valeurs gardées pour « Modifier l'adresse » (le mot de passe est à saisir de nouveau)
  const [draft, setDraft] = useState<Omit<SignupInput, 'password'> | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const done = useRef<HTMLHeadingElement>(null)
  // affichage du formulaire, horloge du navigateur (délai d'attente avant l'envoi)
  const mountedAt = useRef(0)
  const editing = useRef(false)
  const base = useId()

  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  useEffect(() => {
    if (state === 'sent') done.current?.focus()
    // retour au formulaire pour corriger l'adresse
    if (state === 'idle' && editing.current) {
      editing.current = false
      form.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus()
    }
  }, [state])

  function edit() {
    editing.current = true
    setErrors({})
    setState('idle')
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    const fd = new FormData(e.currentTarget)
    const raw = { ...Object.fromEntries(fd.entries()), newsletter: fd.get('newsletter') === 'on', consent: fd.get('consent') === 'on' }
    const { data, errors: errs } = checkSignup(raw)
    setErrors(errs)
    setFailure('')
    if (Object.keys(errs).length) return focusFirstError(form.current, errs)

    setState('sending')
    const elapsed = Date.now() - mountedAt.current
    if (elapsed < MIN_DELAY) await wait(MIN_DELAY - elapsed)
    const res = await memberApi('/inscription', { body: { ...data, website: String(fd.get('website') ?? ''), elapsed: Date.now() - mountedAt.current } })
    const { password: _password, ...kept } = data
    setDraft(kept)
    if (res.ok) return setState('sent')
    if (res.code === 'closed') return setState('closed')
    if (res.errors) {
      setErrors(res.errors)
      focusFirstError(form.current, res.errors)
    } else setFailure(frenchSpaces(res.error))
    setState('idle')
  }

  if (state === 'closed') return <SignupClosed announce />

  if (state === 'sent' && draft) {
    return (
      <div className="contact-done auth-done">
        <span className="contact-done__icon" aria-hidden="true">
          <Icon name="mail" />
        </span>
        <h2 ref={done} tabIndex={-1}>
          Plus qu’une étape&nbsp;: confirmez votre adresse
        </h2>
        <p role="status">
          Nous venons d’envoyer un e-mail à <strong className="auth-email">{draft.email}</strong>. Cliquez sur le lien qu’il contient pour activer votre compte,
          puis connectez-vous.
        </p>
        <ul className="auth-tips">
          <li>
            <Icon name="clock" /> Le lien est valable 48&nbsp;heures.
          </li>
          <li>
            <Icon name="mail" /> Rien reçu d’ici quelques minutes&nbsp;? Regardez dans les courriers indésirables (spam), ou renvoyez l’e-mail.
          </li>
        </ul>
        <div className="auth-done__actions">
          <ResendConfirmation email={draft.email} label="Renvoyer l’e-mail" />
          <button type="button" className="auth-linkbtn" onClick={edit}>
            Une erreur dans l’adresse&nbsp;? Modifier
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <h2 className="auth-title">Vos informations</h2>
      <form ref={form} className="contact-form auth-form" method="post" onSubmit={submit} noValidate>
        <div className="contact-field">
          <label htmlFor={fieldId(base, 'firstName')}>
            Prénom <span aria-hidden="true">*</span>
          </label>
          <input {...fieldAttrs(base, 'firstName', errors)} type="text" autoComplete="given-name" defaultValue={draft?.firstName} required maxLength={60} />
          <FieldError base={base} name="firstName" errors={errors} />
        </div>

        <div className="contact-field">
          <label htmlFor={fieldId(base, 'email')}>
            E-mail <span aria-hidden="true">*</span>
          </label>
          <input
            {...fieldAttrs(base, 'email', errors, true)}
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={draft?.email}
            required
            maxLength={200}
          />
          <p className="contact-hint" id={fieldId(base, 'email', 'hint')}>
            Un lien de confirmation vous sera envoyé à cette adresse.
          </p>
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

        <div className="contact-field">
          <label htmlFor={fieldId(base, 'department')}>Votre département (facultatif)</label>
          <select {...fieldAttrs(base, 'department', errors, true)} className="auth-select" defaultValue={draft?.department ?? ''}>
            <option value="">Je préfère ne pas choisir</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} ({d.code})
              </option>
            ))}
          </select>
          <p className="contact-hint" id={fieldId(base, 'department', 'hint')}>
            Pour votre météo, l’info et les sorties de votre département. Modifiable à tout moment.
          </p>
          <FieldError base={base} name="department" errors={errors} />
        </div>

        {/* champ piège invisible : seuls les robots le remplissent */}
        <div className="contact-trap" aria-hidden="true">
          <label htmlFor={fieldId(base, 'website')}>Ne pas remplir</label>
          <input id={fieldId(base, 'website')} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="auth-checks">
          <div className="contact-field contact-consent">
            <label>
              <input {...fieldAttrs(base, 'newsletter', errors)} type="checkbox" defaultChecked={draft?.newsletter} />
              <span>Recevoir les actualités de Swatter TV par e-mail (facultatif, modifiable dans votre espace).</span>
            </label>
          </div>
          <div className="contact-field contact-consent">
            <label>
              <input {...fieldAttrs(base, 'consent', errors)} type="checkbox" defaultChecked={draft?.consent} required />
              <span>
                J’accepte la{' '}
                <Link href="/vie-privee" target="_blank">
                  politique de confidentialité
                  <span className="sr-only"> (nouvel onglet)</span>
                </Link>{' '}
                de Swatter TV. <span aria-hidden="true">*</span>
              </span>
            </label>
            <FieldError base={base} name="consent" errors={errors} />
          </div>
        </div>

        {failure && (
          <AuthNotice tone="error">
            <p role="alert">{failure}</p>
          </AuthNotice>
        )}

        <div className="auth-submit-row">
          <button type="submit" className="btn btn--gold auth-submit" disabled={state === 'sending'}>
            <Icon name="user" />
            {state === 'sending' ? 'Création du compte…' : 'Créer mon compte'}
          </button>
          <p className="contact-hint">
            <span aria-hidden="true">*</span> Champs obligatoires.
          </p>
        </div>
      </form>
    </>
  )
}
