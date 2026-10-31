// Aperçus animés des vidéos : chaque aperçu visible tourne seul, en boucle, sans geste (ordinateur comme téléphone),
// plusieurs à la fois dans la limite d'un plafond (les plus proches du centre de l'écran), pause hors de l'écran ;
// lecteur d'une fiche (boucle et bouton pause, servi en premier), préférences de l'internaute et onglet masqué.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_RATIO,
  EVAL_MS,
  KEEP_PX,
  MAX_PLAYING,
  MAX_PLAYING_SMALL,
  PreviewDirector,
  previewLimit,
  screenDistance,
  SETTLE_MS,
  VISIBLE_RATIO,
  type PreviewEnv,
  type SlotKind,
} from '@/components/video/preview-director'

const ENV: PreviewEnv = { allowed: true, hidden: false, limit: MAX_PLAYING }

/** Faux aperçu : journal des ordres reçus (« play », « stop »), distance au centre de l'écran réglable, mesures comptées. */
function fake(kind: SlotKind = 'card', distance = 100) {
  const calls: string[] = []
  const item = {
    calls,
    distance,
    measured: 0,
    slot: {
      kind,
      distance: () => {
        item.measured++
        return item.distance
      },
      play: () => calls.push('play'),
      stop: () => calls.push('stop'),
    },
  }
  return item
}

let director: PreviewDirector

function setup(env: Partial<PreviewEnv>, ...items: ReturnType<typeof fake>[]) {
  director = new PreviewDirector({ ...ENV, ...env })
  return items.map((item) => director.register(item.slot))
}

/** Laisse passer le délai d'apparition d'une carte (et le regroupement des changements qui suit). */
const settle = () => vi.advanceTimersByTime(SETTLE_MS + EVAL_MS)
/** Laisse passer le regroupement des changements (nouveau choix). */
const tick = () => vi.advanceTimersByTime(EVAL_MS)

/** Plusieurs aperçus visibles en entier. */
const show = (...ids: number[]) => ids.forEach((id) => director.visibility(id, 1))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  director?.dispose()
  vi.useRealTimers()
})

describe('cartes : en continu dès qu’elles sont visibles', () => {
  it('une carte visible démarre seule, en boucle, sans survol ni toucher, après un court instant', () => {
    const a = fake()
    const [id] = setup({}, a)
    director.visibility(id, 1)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(a.calls, 'pas avant le délai d’apparition').toEqual([])
    tick()
    expect(a.calls).toEqual(['play'])
    expect(director.active).toEqual([id])
    expect(director.isPlaying(id)).toBe(true)
    // et elle continue : aucune limite de durée, aucun arrêt au fil du temps
    vi.advanceTimersByTime(60_000)
    expect(a.calls).toEqual(['play'])
  })

  it('moins de 30 % visible : rien ; au-delà, lancement', () => {
    const a = fake()
    const [id] = setup({}, a)
    director.visibility(id, CARD_RATIO - 0.05)
    settle()
    expect(a.calls).toEqual([])
    director.visibility(id, CARD_RATIO)
    settle()
    expect(a.calls).toEqual(['play'])
  })

  it('défilement rapide : une carte qui ne fait que passer ne charge rien', () => {
    const a = fake()
    const [id] = setup({}, a)
    director.visibility(id, 1)
    vi.advanceTimersByTime(SETTLE_MS / 2)
    director.visibility(id, 0)
    settle()
    // passage partiel (moins de 30 %) avant le délai : rien non plus
    director.visibility(id, 0.8)
    vi.advanceTimersByTime(SETTLE_MS / 2)
    director.visibility(id, 0.1)
    settle()
    expect(a.calls).toEqual([])
  })

  it('plusieurs cartes visibles tournent en même temps', () => {
    const items = [fake(), fake(), fake(), fake()]
    const ids = setup({}, ...items)
    show(...ids)
    settle()
    expect(director.active).toEqual(ids)
    for (const item of items) expect(item.calls).toEqual(['play'])
  })

  it('sortie de l’écran : pause aussitôt ; retour : reprise après le délai d’apparition', () => {
    const a = fake()
    const [id] = setup({}, a)
    director.visibility(id, 1)
    settle()
    director.visibility(id, 0)
    expect(a.calls).toEqual(['play', 'stop'])
    expect(director.active).toEqual([])
    director.visibility(id, 1)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(a.calls).toEqual(['play', 'stop'])
    tick()
    expect(a.calls).toEqual(['play', 'stop', 'play'])
  })

  it('carte lancée puis presque sortie (moins de 30 % visible) : elle tourne jusqu’à sa sortie complète', () => {
    const a = fake()
    const [id] = setup({}, a)
    director.visibility(id, 1)
    settle()
    director.visibility(id, 0.1)
    settle()
    expect(a.calls).toEqual(['play'])
    director.visibility(id, 0)
    expect(a.calls).toEqual(['play', 'stop'])
  })

  it('le défilement ne fait rien tant que toutes les cartes visibles tournent (aucune mesure de position)', () => {
    const a = fake()
    const b = fake()
    const ids = setup({}, a, b)
    show(...ids)
    settle()
    for (let i = 0; i < 20; i++) {
      director.scrolled()
      vi.advanceTimersByTime(20)
    }
    settle()
    expect(a.measured + b.measured).toBe(0)
    expect(a.calls).toEqual(['play'])
    expect(b.calls).toEqual(['play'])
  })
})

describe('plafond d’aperçus lus en même temps', () => {
  it('plafond selon l’appareil : 6 sur grand écran, 3 sur petit écran ou avec peu de mémoire', () => {
    expect(previewLimit(false)).toBe(MAX_PLAYING)
    expect(previewLimit(true)).toBe(MAX_PLAYING_SMALL)
    expect(previewLimit(false, 8)).toBe(MAX_PLAYING)
    expect(previewLimit(false, 4)).toBe(MAX_PLAYING)
    expect(previewLimit(false, 2)).toBe(MAX_PLAYING_SMALL)
    expect(previewLimit(true, 8)).toBe(MAX_PLAYING_SMALL)
    expect([MAX_PLAYING, MAX_PLAYING_SMALL]).toEqual([6, 3])
  })

  it('éloignement : distance au centre de l’écran, augmentée de la part cachée par ses bords', () => {
    const [w, h] = [1440, 900]
    const halfDiagonal = Math.hypot(w, h) / 2
    // carte entière, centrée : 0
    expect(screenDistance({ left: 620, top: 400, width: 200, height: 100 }, w, h)).toBe(0)
    // carte entière : distance seule
    expect(screenDistance({ left: 1120, top: 400, width: 200, height: 100 }, w, h)).toBe(500)
    // carte à moitié sous le bord du bas : moitié de la demi-diagonale en plus
    const cut = screenDistance({ left: 620, top: 850, width: 200, height: 100 }, w, h)
    expect(cut).toBeCloseTo(450 + halfDiagonal / 2)
    // une carte entière dans un coin passe avant une carte coupée en haut, pourtant plus proche du centre
    const corner = screenDistance({ left: 1200, top: 600, width: 220, height: 124 }, w, h)
    const halfHidden = screenDistance({ left: 620, top: -62, width: 220, height: 124 }, w, h)
    expect(corner).toBeLessThan(halfHidden)
    // carte hors de l'écran ou sans taille : la plus éloignée possible
    expect(screenDistance({ left: 0, top: 2000, width: 200, height: 100 }, w, h)).toBeGreaterThan(halfDiagonal)
    expect(screenDistance({ left: 620, top: 400, width: 0, height: 0 }, w, h)).toBeCloseTo(halfDiagonal + Math.hypot(100, 50))
  })

  it('au-delà du plafond, les cartes les plus proches du centre tournent, les autres gardent leur image', () => {
    const far = fake('card', 500)
    const near = fake('card', 10)
    const mid = fake('card', 120)
    const farther = fake('card', 800)
    const ids = setup({ limit: 2 }, far, near, mid, farther)
    show(...ids)
    settle()
    expect(near.calls).toEqual(['play'])
    expect(mid.calls).toEqual(['play'])
    expect(far.calls).toEqual([])
    expect(farther.calls).toEqual([])
    expect(director.active).toHaveLength(2)
  })

  it('une place se libère (carte sortie de l’écran) : la suivante la plus proche la prend', () => {
    const a = fake('card', 10)
    const b = fake('card', 50)
    const c = fake('card', 300)
    const d = fake('card', 900)
    const [ida, idb, idc, idd] = setup({ limit: 2 }, a, b, c, d)
    show(ida, idb, idc, idd)
    settle()
    expect(director.active).toEqual([ida, idb])
    director.visibility(ida, 0)
    expect(a.calls).toEqual(['play', 'stop'])
    tick()
    expect(director.active).toEqual([idb, idc])
    expect(d.calls).toEqual([])
  })

  it('défilement : les élus suivent le centre de l’écran ; une carte qui tourne garde sa place face à une à peine plus proche', () => {
    const top = fake('card', 50)
    const bottom = fake('card', 400)
    const [idt, idb] = setup({ limit: 1 }, top, bottom)
    show(idt, idb)
    settle()
    expect(director.active).toEqual([idt])
    // la carte du bas devient à peine plus proche : pas d'échange
    top.distance = 200
    bottom.distance = 200 - KEEP_PX + 1
    director.scrolled()
    tick()
    expect(director.active).toEqual([idt])
    // nettement plus proche : elle prend la place
    bottom.distance = 20
    director.scrolled()
    tick()
    expect(top.calls).toEqual(['play', 'stop'])
    expect(bottom.calls).toEqual(['play'])
  })

  it('pendant un défilement continu, un nouveau choix au plus toutes les 150 ms (pas d’attente de l’arrêt)', () => {
    const a = fake('card', 10)
    const b = fake('card', 500)
    const [ida, idb] = setup({ limit: 1 }, a, b)
    show(ida, idb)
    settle()
    a.distance = 600
    b.distance = 5
    // défilement toutes les 16 ms pendant 1 s : le choix suit sans attendre la fin du mouvement
    for (let t = 0; t < EVAL_MS; t += 16) {
      director.scrolled()
      vi.advanceTimersByTime(16)
    }
    expect(director.active).toEqual([idb])
    const measures = a.measured
    for (let t = 0; t < 1000; t += 16) {
      director.scrolled()
      vi.advanceTimersByTime(16)
    }
    expect(a.measured - measures).toBeLessThanOrEqual(Math.ceil(1000 / EVAL_MS) + 1)
  })

  it('à distance égale, la première carte de la page', () => {
    const left = fake('card', 90)
    const right = fake('card', 90)
    const [idl, idr] = setup({ limit: 1 }, left, right)
    director.visibility(idr, 1)
    director.visibility(idl, 1)
    settle()
    expect(director.active).toEqual([idl])
  })

  it('passage au petit écran (plafond réduit) : les aperçus les plus éloignés s’arrêtent', () => {
    const items = [fake('card', 10), fake('card', 20), fake('card', 30), fake('card', 400), fake('card', 500)]
    const ids = setup({ limit: 6 }, ...items)
    show(...ids)
    settle()
    expect(director.active).toEqual(ids)
    director.setEnv({ limit: 3 })
    tick()
    expect(director.active).toEqual(ids.slice(0, 3))
    expect(items[3].calls).toEqual(['play', 'stop'])
    expect(items[4].calls).toEqual(['play', 'stop'])
    director.setEnv({ limit: 6 })
    tick()
    expect(director.active).toEqual(ids)
  })
})

describe('lecteur d’une fiche', () => {
  it('en boucle quand il est visible à 60 % ; il continue tant qu’il reste à l’écran ; sorti : pause', () => {
    const player = fake('ambient')
    const [id] = setup({}, player)
    director.visibility(id, VISIBLE_RATIO - 0.1)
    settle()
    expect(player.calls, 'moins de 60 % visible au départ').toEqual([])
    director.visibility(id, 1)
    tick()
    expect(player.calls).toEqual(['play'])
    director.visibility(id, 0.2)
    settle()
    expect(player.calls).toEqual(['play'])
    // aucune limite de durée (bouton pause à la place)
    vi.advanceTimersByTime(60_000)
    expect(player.calls).toEqual(['play'])
    director.visibility(id, 0)
    expect(player.calls).toEqual(['play', 'stop'])
  })

  it('il tourne avec les cartes visibles et passe avant elles dans le plafond', () => {
    const player = fake('ambient', 600)
    const a = fake('card', 10)
    const b = fake('card', 20)
    const [idp, ida, idb] = setup({ limit: 2 }, player, a, b)
    show(idp, ida, idb)
    settle()
    expect(director.active).toEqual([idp, ida])
    expect(b.calls).toEqual([])
  })

  it('bouton pause : arrêt, pas de reprise au choix suivant ; sa place revient à une carte ; « Relancer l’aperçu » le relance aussitôt', () => {
    const player = fake('ambient')
    const card = fake('card')
    const [idp, idc] = setup({ limit: 1 }, player, card)
    show(idp, idc)
    settle()
    expect(director.active).toEqual([idp])
    director.setPaused(idp, true)
    expect(player.calls).toEqual(['play', 'stop'])
    expect(director.active).toEqual([idc])
    director.scrolled()
    settle()
    expect(player.calls).toEqual(['play', 'stop'])
    director.setPaused(idp, false)
    // relance immédiate (le bouton garde le focus sans attendre)
    expect(director.isPlaying(idp)).toBe(true)
    expect(player.calls).toEqual(['play', 'stop', 'play'])
    expect(card.calls).toEqual(['play', 'stop'])
  })

  it('« Relancer l’aperçu » après un passage hors de l’écran, lecteur revenu à moins de 60 % : il tourne (le bouton reste)', () => {
    const player = fake('ambient')
    const [id] = setup({}, player)
    director.visibility(id, 1)
    tick()
    director.setPaused(id, true)
    director.visibility(id, 0)
    director.visibility(id, 0.4)
    settle()
    expect(player.calls).toEqual(['play', 'stop'])
    director.setPaused(id, false)
    expect(director.isPlaying(id)).toBe(true)
    settle()
    expect(player.calls).toEqual(['play', 'stop', 'play'])
    expect(director.isPlaying(id)).toBe(true)
  })

  it('« pause » et « relance » ne concernent que le lecteur', () => {
    const card = fake('card')
    const [id] = setup({}, card)
    director.visibility(id, 1)
    settle()
    director.setPaused(id, true)
    expect(card.calls).toEqual(['play'])
  })
})

describe('préférences et onglet', () => {
  it('« réduire les animations » ou économie de données : rien ne démarre, ni carte, ni lecteur', () => {
    const card = fake('card')
    const player = fake('ambient')
    const [idc, idp] = setup({ allowed: false }, card, player)
    show(idc, idp)
    settle()
    director.setPaused(idp, false)
    settle()
    expect([...card.calls, ...player.calls]).toEqual([])
    expect(director.active).toEqual([])
  })

  it('préférence activée pendant la lecture : arrêt immédiat de tous les aperçus ; retirée : reprise', () => {
    const a = fake('card')
    const player = fake('ambient')
    const [ida, idp] = setup({}, a, player)
    show(ida, idp)
    settle()
    director.setEnv({ allowed: false })
    expect(a.calls).toEqual(['play', 'stop'])
    expect(player.calls).toEqual(['play', 'stop'])
    settle()
    expect(director.active).toEqual([])
    director.setEnv({ allowed: true })
    tick()
    expect(director.active).toEqual([ida, idp])
  })

  it('onglet masqué : tout s’arrête aussitôt ; de retour, les aperçus visibles reprennent', () => {
    const a = fake('card')
    const b = fake('card')
    const [ida, idb] = setup({}, a, b)
    show(ida, idb)
    settle()
    director.setEnv({ hidden: true })
    expect(a.calls).toEqual(['play', 'stop'])
    expect(b.calls).toEqual(['play', 'stop'])
    settle()
    expect(director.active).toEqual([])
    director.setEnv({ hidden: false })
    tick()
    expect(a.calls).toEqual(['play', 'stop', 'play'])
    expect(b.calls).toEqual(['play', 'stop', 'play'])
  })

  it('lecteur lancé puis visible à moins de 60 % (lecture de la description) : il reprend au retour sur l’onglet', () => {
    const player = fake('ambient')
    const [id] = setup({}, player)
    director.visibility(id, 1)
    tick()
    director.visibility(id, 0.4)
    settle()
    expect(player.calls).toEqual(['play'])
    director.setEnv({ hidden: true })
    expect(player.calls).toEqual(['play', 'stop'])
    // aucun nouveau rappel de visibilité au retour : le lecteur n'a franchi aucun seuil
    director.setEnv({ hidden: false })
    tick()
    expect(player.calls).toEqual(['play', 'stop', 'play'])
    expect(director.isPlaying(id)).toBe(true)
    // même chose quand les aperçus sont arrêtés puis relancés (préférence, commande du pied de page)
    director.setEnv({ allowed: false })
    director.setEnv({ allowed: true })
    tick()
    expect(player.calls).toEqual(['play', 'stop', 'play', 'stop', 'play'])
    // sorti de l'écran puis revenu à moins de 60 % : il attend d'être de nouveau visible à 60 %
    director.visibility(id, 0)
    director.visibility(id, 0.4)
    settle()
    expect(player.calls).toEqual(['play', 'stop', 'play', 'stop', 'play', 'stop'])
    director.visibility(id, VISIBLE_RATIO)
    tick()
    expect(player.calls).toEqual(['play', 'stop', 'play', 'stop', 'play', 'stop', 'play'])
  })

  it('aperçu retiré (carte démontée ou fichier illisible) : arrêté, plus jamais proposé, sa place revient à un autre', () => {
    const a = fake('card', 0)
    const b = fake('card', 50)
    const [ida, idb] = setup({ limit: 1 }, a, b)
    show(ida, idb)
    settle()
    expect(director.active).toEqual([ida])
    director.unregister(ida)
    expect(a.calls).toEqual(['play', 'stop'])
    tick()
    expect(b.calls).toEqual(['play'])
    // événements tardifs d'un aperçu retiré : sans effet
    director.visibility(ida, 1)
    director.setPaused(ida, false)
    settle()
    expect(a.calls).toEqual(['play', 'stop'])
    expect(director.isPlaying(ida)).toBe(false)
  })

  it('carte retirée pendant son délai d’apparition : rien n’est lancé', () => {
    const a = fake()
    const [id] = setup({}, a)
    director.visibility(id, 1)
    vi.advanceTimersByTime(SETTLE_MS / 2)
    director.unregister(id)
    settle()
    expect(a.calls).toEqual([])
  })
})
