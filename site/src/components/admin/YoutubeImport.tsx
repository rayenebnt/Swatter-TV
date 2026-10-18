'use client'

import { toast, useDocumentInfo, useFormFields, useFormModified } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const format = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

type Result = { ok: boolean; created: number; videos: number; replays: number; total: number; error?: string }

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Fiche « Chaîne YouTube » : état du dernier import et bouton « Importer maintenant ». */
export function YoutubeImport() {
  const router = useRouter()
  const { initialData } = useDocumentInfo()
  const channel = useFormFields(([fields]) => fields.channel?.value) as string | undefined
  const modified = useFormModified()
  const [busy, setBusy] = useState(false)
  const at = typeof initialData?.lastImportAt === 'string' && !Number.isNaN(Date.parse(initialData.lastImportAt)) ? new Date(initialData.lastImportAt) : null
  const error = typeof initialData?.lastError === 'string' ? initialData.lastError : ''
  const last = typeof initialData?.lastResult === 'string' ? initialData.lastResult : ''

  async function run() {
    setBusy(true)
    try {
      const res = await fetch('/api/youtube/import', { method: 'POST', credentials: 'include' })
      const json = (await res.json().catch(() => null)) as Result | { error?: string } | null
      if (!res.ok || !json || !('ok' in json) || !json.ok) {
        toast.error(`Import impossible : ${json?.error ?? `erreur ${res.status}`}`)
      } else {
        toast.success(
          json.created
            ? [json.videos && `${plural(json.videos, 'vidéo')} ajoutée${json.videos > 1 ? 's' : ''} dans « Vidéos »`, json.replays && `${plural(json.replays, 'vidéo')} dans « Replays »`].filter(Boolean).join(', ')
            : `Les ${plural(json.total, 'vidéo')} de la chaîne sont déjà sur le site`,
        )
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || !channel?.trim() || modified
  return (
    <div className="sw-meteo-status sw-youtube">
      <strong>Dernier import</strong>
      <span>{at ? `${format.format(at)} : ${error ? 'échec' : last || 'terminé'}` : 'aucun pour l’instant'}</span>
      {error && <span className="sw-youtube__error">{error}</span>}
      <div>
        <button type="button" className="sw-youtube__button" onClick={run} disabled={disabled}>
          {busy ? 'Import en cours…' : 'Importer maintenant'}
        </button>
      </div>
      {modified && <span>Enregistrez d’abord vos changements, puis lancez l’import.</span>}
    </div>
  )
}

export default YoutubeImport
