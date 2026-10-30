// Pilotage des aperçus animés (logique pure, sans DOM : testée en unitaire). Chaque aperçu visible tourne seul, en
// boucle et sans le son, sans geste de l'internaute ; hors de l'écran, il est mis en pause. Un plafond limite le nombre
// d'aperçus lus en même temps (téléphones, vieux ordinateurs) : les plus proches du centre de l'écran tournent, les
// autres gardent leur image jusqu'à ce qu'une place se libère.
// Le branchement au navigateur (IntersectionObserver, défilement, préférences, onglet) est dans VideoPreview.tsx.

/** Part visible minimale du lecteur d'une fiche pour lancer son aperçu (aussi celle du direct lancé seul, VideoPlayer). */
export const VISIBLE_RATIO = 0.6
/** Part visible minimale d'une carte pour lancer son aperçu ; il tourne ensuite jusqu'à sa sortie de l'écran. */
export const CARD_RATIO = 0.3
/** Durée pendant laquelle une carte doit rester visible avant son lancement : un défilement rapide ne charge rien. */
export const SETTLE_MS = 300
/** Regroupement des changements (apparitions, défilement, préférences) avant un nouveau choix. */
export const EVAL_MS = 150
/** Aperçus lus en même temps au plus, sur grand écran. */
export const MAX_PLAYING = 6
/** Aperçus lus en même temps au plus, sur petit écran ou sur un appareil à peu de mémoire. */
export const MAX_PLAYING_SMALL = 3
/**
 * Avance (px) d'un aperçu qui tourne déjà sur ceux qui attendent : deux cartes presque à la même distance du centre ne
 * s'échangent pas la place à chaque mouvement.
 */
export const KEEP_PX = 48

/** Plafond selon l'appareil : petit écran (≤ 760 px) ou mémoire de 2 Go au plus (navigator.deviceMemory, Chrome). */
export function previewLimit(smallScreen: boolean, memoryGb?: number): number {
  return smallScreen || (memoryGb !== undefined && memoryGb <= 2) ? MAX_PLAYING_SMALL : MAX_PLAYING
}

/** Rectangle d'un aperçu à l'écran (getBoundingClientRect). */
export type Box = { left: number; top: number; width: number; height: number }

/**
 * Éloignement (px) d'un aperçu, pour départager les cartes au-delà du plafond : distance entre son centre et celui de
 * l'écran, augmentée de sa part cachée (rapportée à la demi-diagonale de l'écran). Une carte entière dans un coin passe
 * ainsi avant une carte coupée à moitié par le bord, même un peu plus proche du centre.
 */
export function screenDistance(box: Box, viewportWidth: number, viewportHeight: number): number {
  const center = Math.hypot(box.left + box.width / 2 - viewportWidth / 2, box.top + box.height / 2 - viewportHeight / 2)
  const width = Math.max(0, Math.min(box.left + box.width, viewportWidth) - Math.max(box.left, 0))
  const height = Math.max(0, Math.min(box.top + box.height, viewportHeight) - Math.max(box.top, 0))
  const area = box.width * box.height
  const shown = area > 0 ? (width * height) / area : 0
  return center + ((1 - shown) * Math.hypot(viewportWidth, viewportHeight)) / 2
}

/**
 * Rôle d'un aperçu :
 * - `card` : carte ou tuile (vidéo, replay, Top 10, « Vidéo du jour », recherche, espace membres) ; tourne dès qu'elle
 *   est visible, dans la limite du plafond ;
 * - `ambient` : lecteur d'une fiche ; en boucle tant qu'il est visible, sauf pause demandée (bouton), servi en premier.
 */
export type SlotKind = 'card' | 'ambient'

/** Aperçu inscrit auprès du pilote (l'élément vidéo, vu par le pilote). */
export type PreviewSlot = {
  kind: SlotKind
  /** Lance l'aperçu (en boucle), ou le reprend là où il s'était arrêté */
  play: () => void
  /** Met l'aperçu en pause et revient à l'image */
  stop: () => void
  /** Éloignement (px) de l'aperçu par rapport au centre de l'écran (screenDistance), mesuré au moment du choix */
  distance: () => number
}

/**
 * Contexte : aperçus permis (ni « réduire les animations » ni économie de données), onglet masqué, plafond d'aperçus lus
 * en même temps (previewLimit).
 */
export type PreviewEnv = { allowed: boolean; hidden: boolean; limit: number }

type Entry = {
  id: number
  slot: PreviewSlot
  /** Part visible (IntersectionObserver), 0 hors écran */
  ratio: number
  /** Carte restée visible SETTLE_MS : elle peut tourner jusqu'à sa sortie de l'écran */
  ready: boolean
  settleTimer: ReturnType<typeof setTimeout> | null
  /** Lecteur : aperçu mis en pause par l'internaute */
  paused: boolean
  /** Lancé par le pilote (play), pas encore arrêté (stop) */
  playing: boolean
}

/** Pilote des aperçus d'une page : décide lesquels tournent, quand ils démarrent et quand ils s'arrêtent. */
export class PreviewDirector {
  private readonly slots = new Map<number, Entry>()
  private seq = 0
  private env: PreviewEnv
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Plus de candidats que de places au dernier choix : le défilement peut changer les élus. */
  private crowded = false

  constructor(env: PreviewEnv) {
    this.env = { ...env }
  }

  /** Aperçus en cours, dans l'ordre d'inscription (tests). */
  get active(): number[] {
    return [...this.slots.values()].filter((e) => e.playing).map((e) => e.id)
  }

  /** L'aperçu doit-il tourner ? (un événement « playing » tardif d'un aperçu arrêté entre-temps est ignoré) */
  isPlaying(id: number): boolean {
    return this.slots.get(id)?.playing === true
  }

  private get canRun() {
    return this.env.allowed && !this.env.hidden
  }

  /** Inscrit un aperçu ; renvoie son identifiant. */
  register(slot: PreviewSlot): number {
    const id = ++this.seq
    this.slots.set(id, { id, slot, ratio: 0, ready: false, settleTimer: null, paused: false, playing: false })
    return id
  }

  /** Retire un aperçu (carte démontée, ou fichier illisible : il ne sera plus proposé) ; sa place se libère. */
  unregister(id: number) {
    const entry = this.slots.get(id)
    if (!entry) return
    this.unsettle(entry)
    if (entry.playing) this.stop(entry)
    this.slots.delete(id)
    this.schedule()
  }

  /** Préférences, taille d'écran ou onglet changés : arrêt immédiat si les aperçus ne sont plus permis. */
  setEnv(next: Partial<PreviewEnv>) {
    this.env = { ...this.env, ...next }
    if (!this.canRun) this.evaluate()
    else this.schedule()
  }

  /** Part visible d'un aperçu (0 : sorti de l'écran, mis en pause aussitôt). */
  visibility(id: number, ratio: number) {
    const entry = this.slots.get(id)
    if (!entry) return
    entry.ratio = ratio
    if (entry.slot.kind === 'card') {
      if (ratio <= 0) {
        entry.ready = false
        this.unsettle(entry)
      } else if (ratio < CARD_RATIO) {
        // passage trop bref ou trop partiel : rien n'est chargé (une carte déjà lancée continue jusqu'à sa sortie)
        if (!entry.ready) this.unsettle(entry)
      } else if (!entry.ready && !entry.settleTimer) {
        // choix regroupé : les cartes apparues ensemble sont classées ensemble (une carte éloignée ne démarre pas
        // pour s'arrêter aussitôt, son fichier à peine demandé)
        entry.settleTimer = setTimeout(() => {
          entry.settleTimer = null
          entry.ready = true
          this.schedule()
        }, SETTLE_MS)
      }
    }
    if (ratio <= 0 && entry.playing) {
      this.stop(entry)
    }
    this.schedule()
  }

  /** Défilement de la page ou d'un rail : nouveau choix seulement si toutes les cartes visibles ne peuvent pas tourner. */
  scrolled() {
    if (this.crowded) this.schedule()
  }

  /** Lecteur : pause demandée par l'internaute (true) ou reprise (false, relance immédiate). */
  setPaused(id: number, paused: boolean) {
    const entry = this.slots.get(id)
    if (!entry || entry.slot.kind !== 'ambient') return
    entry.paused = paused
    if (paused) {
      if (entry.playing) this.stop(entry)
    } else if (this.canRun && !entry.playing) {
      this.start(entry)
    }
    this.evaluate()
  }

  /** Arrête tout (fin de page, tests). */
  dispose() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const entry of this.slots.values()) {
      this.unsettle(entry)
      if (entry.playing) this.stop(entry)
    }
  }

  private unsettle(entry: Entry) {
    if (entry.settleTimer) clearTimeout(entry.settleTimer)
    entry.settleTimer = null
  }

  /** Nouveau choix sous peu (au plus un toutes les EVAL_MS, même pendant un défilement continu). */
  private schedule() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.evaluate()
    }, EVAL_MS)
  }

  private start(entry: Entry) {
    entry.playing = true
    entry.slot.play()
  }

  private stop(entry: Entry) {
    entry.playing = false
    entry.slot.stop()
  }

  /**
   * Les `room` cartes les plus proches du centre de l'écran (et les moins coupées par ses bords) ; une carte qui tourne
   * déjà garde sa place face à une carte à peine plus proche (KEEP_PX) ; à égalité, la première de la page.
   */
  private closest(cards: Entry[], room: number): Entry[] {
    return cards
      .map((entry) => ({ entry, score: entry.slot.distance() - (entry.playing ? KEEP_PX : 0) }))
      .sort((a, b) => a.score - b.score || a.entry.id - b.entry.id)
      .slice(0, room)
      .map((c) => c.entry)
  }

  /** Choix des aperçus qui tournent : le lecteur d'abord, puis les cartes visibles, dans la limite du plafond. */
  private evaluate() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const chosen = new Set<Entry>()
    this.crowded = false
    if (this.canRun) {
      const cards: Entry[] = []
      for (const entry of this.slots.values()) {
        if (entry.slot.kind === 'ambient') {
          // lancé à 60 % visible, il continue tant qu'il reste à l'écran
          if (!entry.paused && entry.ratio > 0 && (entry.ratio >= VISIBLE_RATIO || entry.playing)) chosen.add(entry)
        } else if (entry.ready && entry.ratio > 0) {
          cards.push(entry)
        }
      }
      const room = Math.max(0, this.env.limit - chosen.size)
      this.crowded = cards.length > room
      for (const entry of this.crowded ? this.closest(cards, room) : cards) chosen.add(entry)
    }
    // arrêts d'abord, puis lancements : le décodeur libéré sert à l'aperçu suivant
    for (const entry of this.slots.values()) if (entry.playing && !chosen.has(entry)) this.stop(entry)
    for (const entry of chosen) if (!entry.playing) this.start(entry)
  }
}
