'use client'
// « Mon espace » : section « Mes données » du profil : téléchargement (RGPD), déconnexion de tous les appareils et
// suppression du compte (confirmée par le mot de passe, puis message d'au revoir et retour à l'accueil).
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { notifyMemberChange } from '@/lib/members/browser'
import { PasswordInput } from './PasswordInput'
import { useSpaceApi } from './useSpaceApi'

/** Délai avant le retour automatique à l'accueil après la suppression du compte. */
const FAREWELL_MS = 6000

const count = (n: number | null, one: string, many: string) => (n === null ? '' : ` (${n} ${n > 1 ? many : one})`)

export function AccountData({ historyCount, favoritesCount }: { historyCount: number | null; favoritesCount: number | null }) {
  const router = useRouter()
  const call = useSpaceApi()
  const id = useId()
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const deleteButton = useRef<HTMLButtonElement>(null)
  const pwdField = useRef<HTMLDivElement>(null)
  const farewell = useRef<HTMLDialogElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // page quittée autrement (bouton Précédent) : pas de retour à l'accueil différé
  useEffect(() => {
    const pending = timer
    return () => {
      if (pending.current) clearTimeout(pending.current)
    }
  }, [])

  async function logoutEverywhere() {
    setLeaving(true)
    setLeaveError('')
    const res = await call('/deconnexion', { body: { partout: true } })
    if (res.ok) {
      notifyMemberChange()
      router.replace('/connexion?deconnecte=partout')
      router.refresh()
      return
    }
    setLeaving(false)
    if (res.status !== 401) setLeaveError(res.error)
  }

  function openDelete() {
    setConfirming(true)
    setDeleteError('')
    setPwdError('')
    requestAnimationFrame(() => pwdField.current?.querySelector('input')?.focus())
  }

  function cancelDelete() {
    setConfirming(false)
    requestAnimationFrame(() => deleteButton.current?.focus())
  }

  function goHome() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    router.replace('/')
    router.refresh()
  }

  async function deleteAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get('password') ?? '')
    setDeleteError('')
    if (!password) {
      setPwdError('Indiquez votre mot de passe pour confirmer.')
      return pwdField.current?.querySelector('input')?.focus()
    }
    setPwdError('')
    setDeleting(true)
    const res = await call('/supprimer', { body: { password } })
    setDeleting(false)
    if (res.ok) {
      notifyMemberChange()
      farewell.current?.showModal()
      timer.current = setTimeout(goHome, FAREWELL_MS)
      return
    }
    if (res.errors?.current) {
      setPwdError(res.errors.current)
      pwdField.current?.querySelector('input')?.focus()
    } else if (res.status !== 401) setDeleteError(res.error)
  }

  return (
    <div className="space-data">
      <div className="space-data__row">
        <div>
          <h4>Télécharger mes données</h4>
          <p>Un fichier (format JSON) avec votre profil, votre historique et votre liste.</p>
        </div>
        <a className="btn btn--ghost btn--sm" href="/api/compte/export" download>
          <Icon name="download" />
          Télécharger
        </a>
      </div>

      <div className="space-data__row">
        <div>
          <h4>Me déconnecter de tous les appareils</h4>
          <p>Pratique après une connexion sur un ordinateur partagé ou si vous avez perdu un téléphone. Vous devrez vous reconnecter ici aussi.</p>
          {leaveError && (
            <p className="contact-err" role="alert">
              {leaveError}
            </p>
          )}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={logoutEverywhere} disabled={leaving}>
          <Icon name="logout" />
          {leaving ? 'Déconnexion…' : 'Tout déconnecter'}
        </button>
      </div>

      <div className="space-data__row space-data__row--danger">
        <div>
          <h4>Supprimer mon compte</h4>
          <p>Votre compte et tout ce qu’il contient sont effacés définitivement.</p>
        </div>
        {!confirming && (
          <button ref={deleteButton} type="button" className="btn btn--ghost btn--sm space-btn-danger-ghost" onClick={openDelete}>
            <Icon name="trash" />
            Supprimer mon compte
          </button>
        )}
      </div>

      {confirming && (
        <form
          className="space-danger contact-form"
          method="post"
          onSubmit={deleteAccount}
          noValidate
          aria-labelledby={`${id}-danger`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancelDelete()
          }}
        >
          <h5 id={`${id}-danger`}>Confirmer la suppression de votre compte</h5>
          <p>La suppression est immédiate et définitive. Seront effacés&nbsp;:</p>
          <ul>
            <li>votre profil&nbsp;: prénom, nom, adresse e-mail, département et préférences&nbsp;;</li>
            <li>votre historique{count(historyCount, 'contenu', 'contenus')}&nbsp;;</li>
            <li>votre liste{count(favoritesCount, 'contenu', 'contenus')}.</li>
          </ul>
          <p>Vous ne recevrez plus d’e-mails de Swatter TV. Si vous souhaitez garder une copie, téléchargez vos données avant.</p>
          <div className="contact-field" ref={pwdField}>
            <label htmlFor={`${id}-password`}>Votre mot de passe</label>
            <PasswordInput
              id={`${id}-password`}
              name="password"
              autoComplete="current-password"
              required
              maxLength={200}
              aria-invalid={pwdError ? true : undefined}
              aria-describedby={pwdError ? `${id}-password-err` : undefined}
            />
            {pwdError && (
              <p className="contact-err" id={`${id}-password-err`}>
                {pwdError}
              </p>
            )}
          </div>
          {deleteError && (
            <p className="contact-err contact-err--global" role="alert">
              {deleteError}
            </p>
          )}
          <div className="contact-actions">
            <button type="submit" className="btn btn--sm space-btn-danger" disabled={deleting}>
              <Icon name="trash" />
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelDelete}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <dialog
        ref={farewell}
        className="space-farewell"
        aria-labelledby={`${id}-bye`}
        onCancel={(e) => {
          e.preventDefault()
          goHome()
        }}
        // fermée malgré tout (navigateur qui ignore l'annulation après deux appuis sur Échap) : même retour à l'accueil
        onClose={goHome}
      >
        <span className="space-farewell__icon" aria-hidden="true">
          <Icon name="check" />
        </span>
        <h2 id={`${id}-bye`}>Votre compte a été supprimé</h2>
        <p>Votre profil, votre historique et votre liste ont été effacés. Merci d’avoir suivi Swatter TV, à bientôt&nbsp;!</p>
        <p className="contact-hint">Retour à l’accueil dans quelques secondes.</p>
        {/* seul élément activable : il reçoit le focus à l'ouverture de la fenêtre (showModal) */}
        <button type="button" className="btn btn--gold btn--sm" onClick={goHome}>
          Revenir à l’accueil
        </button>
      </dialog>
    </div>
  )
}
