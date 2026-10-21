'use client'
// « Mon espace » : historique regroupé par jour, avec retrait d'une entrée, effacement complet (confirmation en deux
// temps) et mise en pause. Mises à jour optimistes, puis nouvelle lecture des données de la page (router.refresh()).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { MemberProfile } from '@/lib/members/shared'
import { SpaceRow } from './ItemCard'
import { SpaceEmpty } from './SpaceBlock'
import type { HistoryGroup, SpaceEntry } from './types'
import { useSpaceApi } from './useSpaceApi'

const params = (e: SpaceEntry) => `kind=${encodeURIComponent(e.item.kind)}&id=${e.item.id}`

export function HistoryManager({ groups, paused: initialPaused }: { groups: HistoryGroup[]; paused: boolean }) {
  const router = useRouter()
  const call = useSpaceApi()
  const id = useId()
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const [cleared, setCleared] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [paused, setPaused] = useState(initialPaused)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [failure, setFailure] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const clearButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const summary = useRef<HTMLParagraphElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)

  const visible = cleared ? [] : groups.map((g) => ({ ...g, entries: g.entries.filter((e) => !removed.has(e.key)) })).filter((g) => g.entries.length)
  const count = visible.reduce((n, g) => n + g.entries.length, 0)

  const setRemovedKey = (key: string, on: boolean) =>
    setRemoved((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  /** Après un retrait : focus sur le bouton « Retirer » suivant (ou précédent), sinon sur le décompte ou la barre d'outils. */
  const refocus = (index: number) =>
    requestAnimationFrame(() => {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')
      const target = buttons?.length ? buttons[Math.min(index, buttons.length - 1)] : null
      ;(target ?? summary.current ?? toolbar.current)?.focus()
    })

  async function remove(entry: SpaceEntry) {
    const index = [...(list.current?.querySelectorAll('[data-remove]') ?? [])].findIndex((b) => b.closest('[data-key]')?.getAttribute('data-key') === entry.key)
    setFailure('')
    setStatus('')
    setRemovedKey(entry.key, true)
    refocus(Math.max(0, index))
    const res = await call(`/historique?${params(entry)}`, { method: 'DELETE' })
    if (res.ok) {
      setStatus(`« ${entry.item.title} » a été retiré de votre historique.`)
      router.refresh()
    } else if (res.status !== 401) {
      setRemovedKey(entry.key, false)
      setFailure(res.error)
    }
  }

  function askClear() {
    setConfirming(true)
    setFailure('')
    // par défaut sur « Annuler » : deux appuis sur Entrée n'effacent rien par mégarde
    requestAnimationFrame(() => cancelButton.current?.focus())
  }

  function cancelClear() {
    setConfirming(false)
    requestAnimationFrame(() => clearButton.current?.focus())
  }

  async function clearAll() {
    setClearing(true)
    setFailure('')
    setStatus('')
    setCleared(true)
    setConfirming(false)
    requestAnimationFrame(() => toolbar.current?.focus())
    const res = await call('/historique', { method: 'DELETE' })
    setClearing(false)
    if (res.ok) {
      setStatus('Votre historique a été effacé.')
      router.refresh()
    } else if (res.status !== 401) {
      setCleared(false)
      setFailure(res.error)
    }
  }

  async function togglePause() {
    // pas de `disabled` pendant l'envoi : le bouton garderait mal le focus du clavier
    if (saving) return
    const next = !paused
    setSaving(true)
    setFailure('')
    setStatus('')
    setPaused(next)
    const res = await call<MemberProfile>('/profil', { method: 'PATCH', body: { historyPaused: next } })
    setSaving(false)
    if (res.ok) {
      setPaused(res.data.historyPaused)
      setStatus(res.data.historyPaused ? 'Historique en pause : les prochaines vidéos regardées ne seront pas enregistrées.' : 'Historique réactivé.')
      router.refresh()
    } else if (res.status !== 401) {
      setPaused(!next)
      setFailure(res.error)
    }
  }

  return (
    <div className="space-history">
      <div ref={toolbar} className="space-toolbar" tabIndex={-1}>
        <div className="space-switch">
          <button
            type="button"
            role="switch"
            aria-checked={paused}
            aria-describedby={`${id}-pause`}
            aria-disabled={saving || undefined}
            className="space-switch__btn"
            onClick={togglePause}
          >
            <span className="space-switch__track" aria-hidden="true">
              <span className="space-switch__thumb" />
            </span>
            Mettre l’historique en pause
          </button>
          <p className="contact-hint" id={`${id}-pause`}>
            En pause, les vidéos et replays que vous regardez ne sont plus ajoutés à votre historique. Les entrées déjà présentes restent
            ici tant que vous ne les retirez pas.
          </p>
        </div>

        {count > 0 &&
          (confirming ? (
            <div
              className="space-confirm"
              role="group"
              aria-labelledby={`${id}-confirm`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelClear()
              }}
            >
              <p id={`${id}-confirm`}>
                Effacer {count > 1 ? `les ${count} entrées` : 'l’entrée'} de votre historique&nbsp;? C’est définitif.
              </p>
              <div className="space-confirm__actions">
                <button type="button" className="btn btn--sm space-btn-danger" onClick={clearAll} disabled={clearing}>
                  <Icon name="trash" />
                  Oui, tout effacer
                </button>
                <button ref={cancelButton} type="button" className="btn btn--ghost btn--sm" onClick={cancelClear}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button ref={clearButton} type="button" className="btn btn--ghost btn--sm" onClick={askClear}>
              <Icon name="trash" />
              Effacer tout l’historique
            </button>
          ))}
      </div>

      {paused && (
        <p className="space-notice">
          <Icon name="clock" />
          Votre historique est en pause&nbsp;: les vidéos que vous regardez ne sont pas enregistrées.
        </p>
      )}

      <p className="space-status" role="status">
        {status}
      </p>
      {failure && (
        <p className="contact-err contact-err--global" role="alert">
          {failure}
        </p>
      )}

      <div ref={list} className="space-days">
        {count > 0 && (
          <p ref={summary} tabIndex={-1} className="space-count-line">
            {count} {count > 1 ? 'contenus' : 'contenu'} dans votre historique
          </p>
        )}
        {visible.length ? (
          visible.map((g) => (
            // simple bloc titré (pas de région nommée par jour : trop de repères pour les lecteurs d'écran)
            <div key={g.day} className="space-day">
              <h3 className="space-day__label">{g.label}</h3>
              <ol className="space-rows">
                {g.entries.map((e) => (
                  <li key={e.key} data-key={e.key}>
                    <SpaceRow entry={e} remove={{ label: 'Retirer de l’historique', onRemove: () => remove(e) }} />
                  </li>
                ))}
              </ol>
            </div>
          ))
        ) : (
          <SpaceEmpty icon="clock" title={paused ? 'Historique vide et en pause' : 'Votre historique est vide'}>
            {paused ? (
              <>Réactivez-le avec l’interrupteur ci-dessus pour retrouver ici les vidéos que vous regardez.</>
            ) : (
              <>
                Les vidéos et replays que vous regardez en étant connecté s’affichent ici, jour par jour. Découvrez <Link href="/videos">les vidéos</Link>{' '}
                ou <Link href="/replay">les replays</Link>.
              </>
            )}
          </SpaceEmpty>
        )}
      </div>
    </div>
  )
}
