'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { formatTime } from '@/lib/format'

// Horloge partagée : un seul minuteur pour toutes les horloges de la page, calé sur les secondes,
// actif seulement s'il reste une horloge visible et que l'onglet est affiché.
const EMPTY = '--:--:--'
let value = EMPTY
let minute = -1
let hhmm = ''
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

/** « 14:05:09 » en heure de Paris (les secondes sont les mêmes partout : décalage en heures entières). */
function read(): string {
  const now = Date.now()
  const m = Math.floor(now / 60_000)
  if (m !== minute) {
    minute = m
    hhmm = formatTime(new Date(now))
  }
  return `${hhmm}:${String(Math.floor(now / 1000) % 60).padStart(2, '0')}`
}

function tick() {
  timer = undefined
  const next = read()
  if (next !== value) {
    value = next
    listeners.forEach((l) => l())
  }
  if (listeners.size && !document.hidden) timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 15)
}

function stop() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function onVisibility() {
  if (document.hidden) stop()
  else if (timer === undefined) tick()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) document.addEventListener('visibilitychange', onVisibility)
  if (timer === undefined && !document.hidden) tick()
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
    // Plus aucune horloge visible : la prochaine affichera « --:--:-- » plutôt qu'une heure périmée
    value = EMPTY
  }
}

const idle = () => () => {}
const getSnapshot = () => value
const getServerSnapshot = () => EMPTY

/** Heure de Paris hh:mm:ss, affichée après le montage (« --:--:-- » au premier rendu), en pause hors écran. */
export function LiveClock({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const time = useSyncExternalStore(visible ? subscribe : idle, getSnapshot, getServerSnapshot)
  return (
    <span ref={ref} className={className}>
      {time}
    </span>
  )
}
