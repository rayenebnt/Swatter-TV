// Pilotage des aperçus animés (logique pure, sans DOM : testée en unitaire) : un seul aperçu actif à la fois sur la page.
// Le branchement au navigateur (survol, focus, IntersectionObserver, défilement, préférences) est dans VideoPreview.tsx.

/** Part visible minimale pour lancer un aperçu sans action de l'internaute. */
export const VISIBLE_RATIO = 0.6
/** Délai après l'arrêt du défilement avant de choisir l'aperçu à lancer (écran tactile, « Vidéo du jour », lecteur). */
export const IDLE_MS = 400
/** Délai de survol avant le lancement : la souris qui traverse une rangée de cartes ne charge rien. */
export const HOVER_MS = 150
/** Durée maximale d'un aperçu lancé seul (WCAG 2.2.2 : pas plus de 5 s de mouvement automatique sans bouton pause). */
export const AUTO_MAX_MS = 5000
/** Écart de distance au centre en dessous duquel deux aperçus sont à égalité (arrondis du navigateur). */
const TIE_PX = 4

/**
 * Rôle d'un aperçu :
 * - `card` : carte ; survol ou focus clavier (souris), carte la plus visible après le défilement (écran tactile, une fois) ;
 * - `hover` : petite vignette (recherche, historique) ; survol ou focus clavier seulement ;
 * - `feature` : grande tuile (« Vidéo du jour ») ; comme une carte, et lancée seule une fois visible, même à la souris ;
 * - `ambient` : lecteur d'une fiche ; en boucle tant qu'il est visible, sauf pause demandée (bouton), priorité la plus basse.
 */
export type SlotKind = 'card' | 'hover' | 'feature' | 'ambient'

/** Aperçu inscrit auprès du pilote (l'élément vidéo, vu par le pilote). */
export type PreviewSlot = {
  kind: SlotKind
  /** Lance l'aperçu, en boucle ou une seule fois */
  play: (loop: boolean) => void
  /** Arrête l'aperçu et revient à l'image */
  stop: () => void
  /** Distance (px) entre le centre de l'aperçu et le centre de l'écran, mesurée au moment du choix */
  distance: () => number
}

/** Contexte : aperçus permis (ni « réduire les animations » ni économie de données), souris (survol possible), onglet masqué. */
export type PreviewEnv = { allowed: boolean; pointer: boolean; hidden: boolean }

type Entry = {
  slot: PreviewSlot
  order: number
  /** Part visible (IntersectionObserver), 0 hors écran */
  ratio: number
  hovered: boolean
  focused: boolean
  /** Ordre de la dernière prise en main (survol ou focus) : la plus récente l'emporte */
  heldAt: number
  /** Déjà joué seul depuis son entrée à l'écran : ne rejoue qu'après être sorti puis revenu */
  played: boolean
  /** Lecteur : aperçu mis en pause par l'internaute */
  paused: boolean
}

/** Aperçu en cours : en boucle ou une fois, lancé par l'internaute (survol, focus) ou seul. */
export type ActivePreview = { id: number; loop: boolean; by: 'user' | 'auto' }

/** Pilote des aperçus d'une page : décide lequel tourne, quand il démarre et quand il s'arrête. */
export class PreviewDirector {
  private readonly slots = new Map<number, Entry>()
  private seq = 0
  private clock = 0
  /**
   * Un aperçu peut être lancé seul au prochain choix : vrai après un défilement, un changement de visibilité ou de
   * contexte. Faux une fois le choix fait : à la fin d'un aperçu, la carte voisine ne prend pas le relais sans geste.
   */
  private armed = true
  private env: PreviewEnv
  private active: ActivePreview | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private hoverTimer: ReturnType<typeof setTimeout> | null = null
  private capTimer: ReturnType<typeof setTimeout> | null = null

  constructor(env: PreviewEnv) {
    this.env = { ...env }
  }

  /** Aperçu en cours (null : aucun). */
  get current(): ActivePreview | null {
    return this.active ? { ...this.active } : null
  }

  private get canRun() {
    return this.env.allowed && !this.env.hidden
  }

  /** Inscrit un aperçu ; renvoie son identifiant. */
  register(slot: PreviewSlot): number {
    const id = ++this.seq
    this.slots.set(id, { slot, order: id, ratio: 0, hovered: false, focused: false, heldAt: 0, played: false, paused: false })
    this.armed = true
    this.schedule()
    return id
  }

  /** Retire un aperçu (carte démontée, ou fichier illisible : il ne sera plus proposé). */
  unregister(id: number) {
    const entry = this.slots.get(id)
    if (!entry) return
    if (this.active?.id === id) this.stopActive()
    this.slots.delete(id)
    this.schedule()
  }

  /** Préférences, type d'écran ou onglet changés. */
  setEnv(next: Partial<PreviewEnv>) {
    const pointerChanged = next.pointer !== undefined && next.pointer !== this.env.pointer
    this.env = { ...this.env, ...next }
    if (pointerChanged) {
      // souris branchée ou retirée : les deux façons de faire ne se mélangent pas
      this.clearHover()
      for (const entry of this.slots.values()) entry.hovered = false
      this.stopActive()
    }
    if (!this.canRun) {
      this.clearHover()
      this.stopActive()
    }
    this.armed = true
    this.schedule()
  }

  /** Part visible d'un aperçu (0 : sorti de l'écran). */
  visibility(id: number, ratio: number) {
    const entry = this.slots.get(id)
    if (!entry) return
    entry.ratio = ratio
    if (ratio <= 0) {
      // hors écran : arrêt ; revenu plus tard, il pourra rejouer
      if (this.active?.id === id) this.stopActive()
      entry.played = false
    }
    this.armed = true
    this.schedule()
  }

  /** Défilement de la page ou d'un rail : le choix attend la fin du mouvement. */
  scrolled() {
    this.armed = true
    this.schedule()
  }

  /** Souris sur la carte : lancement après un court délai si elle y reste. */
  pointerEnter(id: number) {
    const entry = this.slots.get(id)
    if (!entry || !this.env.pointer || entry.slot.kind === 'ambient') return
    entry.hovered = true
    entry.heldAt = ++this.clock
    this.clearHover()
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null
      if (entry.hovered && this.slots.get(id) === entry) this.engage(id)
    }, HOVER_MS)
  }

  pointerLeave(id: number) {
    const entry = this.slots.get(id)
    if (!entry) return
    entry.hovered = false
    this.release(id, entry)
  }

  /** Focus clavier sur la carte : lancement immédiat. */
  focusIn(id: number) {
    const entry = this.slots.get(id)
    if (!entry || entry.slot.kind === 'ambient') return
    entry.focused = true
    entry.heldAt = ++this.clock
    this.engage(id)
  }

  focusOut(id: number) {
    const entry = this.slots.get(id)
    if (!entry) return
    entry.focused = false
    this.release(id, entry)
  }

  /** L'aperçu tourne vraiment (événement « playing ») : un aperçu lancé seul s'arrête au plus tard 5 s après. */
  playing(id: number) {
    if (this.active?.id !== id || this.active.loop || this.capTimer) return
    this.capTimer = setTimeout(() => {
      this.capTimer = null
      this.ended(id)
    }, AUTO_MAX_MS)
  }

  /** Fin de l'extrait (lecture unique) ou durée maximale atteinte : retour à l'image. */
  ended(id: number) {
    if (this.active?.id !== id) return
    this.stopActive()
    this.schedule()
  }

  /** Lecteur : pause demandée par l'internaute (true) ou reprise (false). */
  setPaused(id: number, paused: boolean) {
    const entry = this.slots.get(id)
    if (!entry || entry.slot.kind !== 'ambient') return
    entry.paused = paused
    if (paused) {
      if (this.active?.id === id) this.stopActive()
    } else if (this.canRun) {
      this.start(id, true, 'auto')
    }
  }

  /** Arrête tout (fin de page, tests). */
  dispose() {
    this.clearHover()
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.stopActive()
  }

  private clearHover() {
    if (this.hoverTimer) clearTimeout(this.hoverTimer)
    this.hoverTimer = null
  }

  private clearCap() {
    if (this.capTimer) clearTimeout(this.capTimer)
    this.capTimer = null
  }

  private schedule() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.evaluate()
    }, IDLE_MS)
  }

  /** Survol ou focus : l'aperçu tourne en boucle tant que la carte est tenue. */
  private engage(id: number) {
    if (this.canRun) this.start(id, true, 'user')
  }

  /** Survol et focus terminés : arrêt de l'aperçu de la carte, puis nouveau choix. */
  private release(id: number, entry: Entry) {
    if (!entry.hovered && !entry.focused && this.active?.id === id && this.active.by === 'user') this.stopActive()
    this.schedule()
  }

  private start(id: number, loop: boolean, by: ActivePreview['by']) {
    const entry = this.slots.get(id)
    if (!entry) return
    // vu au survol ou au focus : il ne repartira pas seul en quittant la carte
    if (by === 'user') entry.played = true
    if (this.active?.id === id) {
      if (this.active.loop === loop) {
        this.active.by = by
        return
      }
      // même aperçu, autre façon (lancé seul puis survolé) : il continue sans repartir du début
      if (!this.active.loop) entry.played = true
      this.active = { id, loop, by }
      this.clearCap()
      entry.slot.play(loop)
      return
    }
    this.stopActive()
    this.active = { id, loop, by }
    entry.slot.play(loop)
  }

  private stopActive() {
    const current = this.active
    if (!current) return
    this.active = null
    this.clearCap()
    const entry = this.slots.get(current.id)
    if (!entry) return
    if (!current.loop) entry.played = true
    entry.slot.stop()
  }

  /** Carte tenue (survol ou focus) la plus récente. */
  private held(): number | null {
    let best: number | null = null
    let at = -1
    for (const [id, entry] of this.slots) {
      if ((entry.hovered || entry.focused) && entry.heldAt > at) {
        best = id
        at = entry.heldAt
      }
    }
    return best
  }

  /**
   * Aperçu le plus proche du centre de l'écran ; à quelques pixels près (deux cartes côte à côte d'une grille), le
   * premier de la page.
   */
  private closest(ids: number[]): number {
    let best: { id: number; order: number; distance: number } | null = null
    for (const id of ids) {
      const entry = this.slots.get(id)!
      const current = { id, order: entry.order, distance: entry.slot.distance() }
      if (!best) best = current
      else if (current.distance < best.distance - TIE_PX) best = current
      else if (Math.abs(current.distance - best.distance) <= TIE_PX && current.order < best.order) best = current
    }
    return best!.id
  }

  /** Choix de l'aperçu qui tourne, une fois le défilement arrêté. */
  private evaluate() {
    if (!this.canRun) {
      this.stopActive()
      return
    }
    const held = this.held()
    if (held !== null) {
      if (this.active?.id !== held || !this.active.loop) this.start(held, true, 'user')
      return
    }
    if (this.active?.by === 'user') this.stopActive()

    // cartes visibles à 60 % et pas encore jouées : sur écran tactile, toutes ; à la souris, la grande tuile seulement
    if (this.armed) {
      this.armed = false
      const touch = !this.env.pointer
      const cards: number[] = []
      for (const [id, entry] of this.slots) {
        const kind = entry.slot.kind
        if ((kind === 'feature' || (touch && kind === 'card')) && entry.ratio >= VISIBLE_RATIO && !entry.played) cards.push(id)
      }
      if (cards.length) {
        const id = this.closest(cards)
        if (this.active?.id !== id) this.start(id, false, 'auto')
        return
      }
    }
    // aperçu unique en cours (déjà moins visible) : il va jusqu'au bout
    if (this.active && !this.active.loop) return

    // lecteur d'une fiche : en boucle tant qu'il est visible
    let ambient: number | null = null
    for (const [id, entry] of this.slots) {
      if (entry.slot.kind !== 'ambient' || entry.paused) continue
      const visible = entry.ratio >= VISIBLE_RATIO || (this.active?.id === id && entry.ratio > 0)
      if (visible) {
        ambient = id
        break
      }
    }
    if (ambient !== null) {
      if (this.active?.id !== ambient) this.start(ambient, true, 'auto')
    } else if (this.active) {
      this.stopActive()
    }
  }
}
