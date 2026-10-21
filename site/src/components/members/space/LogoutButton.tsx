'use client'
// « Mon espace » : bouton « Se déconnecter » de l'en-tête (ferme la session de cet appareil, retour à l'accueil).
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { memberApi, notifyMemberChange } from '@/lib/members/browser'

export function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  async function logout() {
    setBusy(true)
    setFailure('')
    const res = await memberApi('/deconnexion', { method: 'POST', body: {} })
    // 401 : la session était déjà fermée, le résultat est le même
    if (res.ok || res.status === 401) {
      notifyMemberChange()
      router.replace('/')
      router.refresh()
      return
    }
    setFailure(res.error)
    setBusy(false)
  }

  return (
    <div className="space-logout">
      <button type="button" className="btn btn--ghost btn--sm" onClick={logout} disabled={busy}>
        <Icon name="logout" />
        {busy ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
      {failure && (
        <p className="contact-err" role="alert">
          {failure}
        </p>
      )}
    </div>
  )
}
