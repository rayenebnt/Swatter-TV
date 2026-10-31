'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatTime } from '@/lib/format'
import { capitalize, dayLong, formatDuration, isAfterMidnight, minutesBetween, programImage, type GridProgram, type GridSlot } from './model'

/**
 * Panneau de détail d'une émission (dialogue modal natif) : focus piégé, Échap, retour du focus au bloc d'origine,
 * fermeture au clic sur le fond, défilement de la page verrouillé. Monté uniquement quand une émission est choisie.
 */
export function ProgramDialog({
  slot,
  program,
  day,
  now,
  onClose,
}: {
  slot: GridSlot
  program: GridProgram | undefined
  day: string
  now: number | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    // Verrouillage du défilement (avec compensation de la barre de défilement sur ordinateur)
    const html = document.documentElement
    const body = document.body
    const scrollbar = window.innerWidth - html.clientWidth
    const prev = { overflow: html.style.overflow, paddingRight: body.style.paddingRight }
    html.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    // Pas de close() ici : son événement « close », différé, refermerait le panneau remonté par le mode strict ;
    // retiré du document, le dialogue quitte de lui-même la couche supérieure.
    return () => {
      html.style.overflow = prev.overflow
      body.style.paddingRight = prev.paddingRight
    }
  }, [])

  const start = Date.parse(slot.start)
  const end = Date.parse(slot.end)
  const live = now !== null && now >= start && now < end
  const left = live ? Math.max(1, Math.round((end - now) / 60_000)) : 0
  const progress = live ? (now - start) / (end - start) : 0

  return (
    <dialog
      ref={ref}
      className="tvd"
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        // Clic sur le fond (le dialogue lui-même, hors de son contenu)
        if (e.target === e.currentTarget && pressedBackdrop.current) e.currentTarget.close()
      }}
    >
      <div className="tvd__in">
        <div className="tvd__media">
          <Image src={programImage(program)} alt="" fill sizes="(max-width: 760px) 100vw, 560px" />
          {(live || program?.isPremiere) && (
            <p className="tvd__badges">
              {live && (
                <span className="badge badge--live">
                  <i />
                  En cours
                </span>
              )}
              {program?.isPremiere && <span className="badge badge--gold">Inédit</span>}
            </p>
          )}
        </div>
        <button className="icon-btn tvd__close" type="button" aria-label="Fermer le détail de l’émission" onClick={() => ref.current?.close()}>
          <Icon name="x" className="ico" />
        </button>
        <div className="tvd__body">
          {program?.genreLabel && <p className="kicker">{program.genreLabel}</p>}
          <h2 id={titleId}>{slot.title}</h2>
          <ul className="tvd__when">
            <li>
              <Icon name="cal" />
              <span>{capitalize(dayLong(day))}</span>
            </li>
            <li>
              <Icon name="clock" />
              <span>
                <time dateTime={slot.start}>{formatTime(slot.start)}</time> – <time dateTime={slot.end}>{formatTime(slot.end)}</time> ({formatDuration(minutesBetween(slot.start, slot.end))})
                {/* 00:15 sous la date de la veille : la soirée continue après minuit */}
                {isAfterMidnight(slot.start, day) && <small className="tvd__night"> · après minuit</small>}
              </span>
            </li>
            {program?.isPremiere && (
              <li>
                <Icon name="star" />
                <span>Première diffusion</span>
              </li>
            )}
          </ul>
          {live && (
            <div className="tvd__progress">
              <div className="tvd__bar" role="progressbar" aria-label="Avancement de l’émission" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <span style={{ '--p': progress } as CSSProperties} />
              </div>
              <p>Il reste {formatDuration(left)}</p>
            </div>
          )}
          {program?.synopsis && <p className="tvd__desc">{program.synopsis}</p>}
          {live && (
            <p className="tvd__actions">
              <Link className="btn btn--gold btn--sm" href="/direct">
                <Icon name="play" />
                Regarder le direct
              </Link>
            </p>
          )}
        </div>
      </div>
    </dialog>
  )
}
