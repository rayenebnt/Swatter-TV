// Aperçus animés des vidéos : choix de l'aperçu qui tourne (un seul à la fois), à la souris (survol, focus clavier),
// sur écran tactile (carte la plus visible après le défilement, une seule fois), « Vidéo du jour » lancée seule,
// lecteur d'une fiche (boucle et bouton pause), préférences de l'internaute et onglet masqué.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_MAX_MS, HOVER_MS, IDLE_MS, PreviewDirector, type PreviewEnv, type SlotKind } from '@/components/video/preview-director'

const POINTER: PreviewEnv = { allowed: true, pointer: true, hidden: false }
const TOUCH: PreviewEnv = { allowed: true, pointer: false, hidden: false }

/** Faux aperçu : journal des ordres reçus (« loop », « once », « stop ») et distance au centre de l'écran réglable. */
function fake(kind: SlotKind = 'card', distance = 100) {
  const calls: string[] = []
  const slot = {
    kind,
    distance: () => item.distance,
    play: (loop: boolean) => calls.push(loop ? 'loop' : 'once'),
    stop: () => calls.push('stop'),
  }
  const item = { slot, calls, distance }
  return item
}

let director: PreviewDirector

function setup(env: PreviewEnv, ...items: ReturnType<typeof fake>[]) {
  director = new PreviewDirector(env)
  return items.map((item) => director.register(item.slot))
}

/** Laisse passer le délai d'arrêt du défilement (choix de l'aperçu). */
const idle = () => vi.advanceTimersByTime(IDLE_MS)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  director?.dispose()
  vi.useRealTimers()
})

describe('à la souris', () => {
  it('le survol lance l’aperçu en boucle après un court délai ; la sortie le ramène à l’image', () => {
    const a = fake()
    const [id] = setup(POINTER, a)
    director.visibility(id, 1)
    idle()
    expect(a.calls, 'une carte ne démarre pas seule à la souris').toEqual([])
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS - 1)
    expect(a.calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(a.calls).toEqual(['loop'])
    expect(director.current).toMatchObject({ id, loop: true, by: 'user' })
    director.pointerLeave(id)
    expect(a.calls).toEqual(['loop', 'stop'])
    expect(director.current).toBeNull()
  })

  it('la souris qui traverse une carte sans s’arrêter ne charge rien', () => {
    const a = fake()
    const [id] = setup(POINTER, a)
    director.visibility(id, 1)
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS / 2)
    director.pointerLeave(id)
    vi.advanceTimersByTime(IDLE_MS * 3)
    expect(a.calls).toEqual([])
  })

  it('un seul aperçu à la fois : survoler une autre carte arrête la première', () => {
    const a = fake()
    const b = fake()
    const [ida, idb] = setup(POINTER, a, b)
    director.pointerEnter(ida)
    vi.advanceTimersByTime(HOVER_MS)
    director.pointerLeave(ida)
    director.pointerEnter(idb)
    vi.advanceTimersByTime(HOVER_MS)
    expect(a.calls).toEqual(['loop', 'stop'])
    expect(b.calls).toEqual(['loop'])
    expect(director.current?.id).toBe(idb)
  })

  it('focus clavier : lancement immédiat, arrêt quand le focus quitte la carte ; le plus récent l’emporte', () => {
    const a = fake()
    const b = fake()
    const [ida, idb] = setup(POINTER, a, b)
    director.focusIn(ida)
    expect(a.calls).toEqual(['loop'])
    // la souris passe sur une autre carte pendant que la première a le focus : la carte survolée l'emporte
    director.pointerEnter(idb)
    vi.advanceTimersByTime(HOVER_MS)
    expect(director.current?.id).toBe(idb)
    idle()
    expect(director.current?.id, 'le choix suivant ne revient pas à la carte qui a le focus').toBe(idb)
    director.pointerLeave(idb)
    idle()
    // la carte qui a toujours le focus reprend
    expect(director.current?.id).toBe(ida)
    director.focusOut(ida)
    expect(director.current).toBeNull()
    expect(a.calls.at(-1)).toBe('stop')
  })

  it('« Vidéo du jour » : lancée seule une fois visible à 60 %, une seule fois, puis retour à l’image', () => {
    const tile = fake('feature')
    const [id] = setup(POINTER, tile)
    director.visibility(id, 0.4)
    idle()
    expect(tile.calls, 'moins de 60 % visible').toEqual([])
    director.visibility(id, 0.7)
    vi.advanceTimersByTime(IDLE_MS - 1)
    expect(tile.calls, 'attend l’arrêt du défilement').toEqual([])
    vi.advanceTimersByTime(1)
    expect(tile.calls).toEqual(['once'])
    expect(director.current).toMatchObject({ id, loop: false, by: 'auto' })
    director.ended(id)
    expect(tile.calls).toEqual(['once', 'stop'])
    director.scrolled()
    idle()
    expect(tile.calls, 'ne rejoue pas tant qu’elle reste à l’écran').toEqual(['once', 'stop'])
    // sortie puis retour : elle rejoue
    director.visibility(id, 0)
    director.visibility(id, 1)
    idle()
    expect(tile.calls).toEqual(['once', 'stop', 'once'])
  })

  it('« Vidéo du jour » survolée pendant sa lecture : elle passe en boucle sans repartir, et ne repart pas seule ensuite', () => {
    const tile = fake('feature')
    const [id] = setup(POINTER, tile)
    director.visibility(id, 1)
    idle()
    director.playing(id)
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS)
    expect(tile.calls).toEqual(['once', 'loop'])
    // plus de limite de 5 s : l'internaute la regarde
    vi.advanceTimersByTime(AUTO_MAX_MS * 2)
    expect(director.current).toMatchObject({ id, loop: true })
    director.pointerLeave(id)
    director.scrolled()
    idle()
    expect(tile.calls).toEqual(['once', 'loop', 'stop'])
  })

  it('« Vidéo du jour » survolée avant d’avoir joué : elle ne repart pas seule quand la souris la quitte', () => {
    const tile = fake('feature')
    const [id] = setup(POINTER, tile)
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS)
    director.visibility(id, 1)
    director.pointerLeave(id)
    idle()
    expect(tile.calls).toEqual(['loop', 'stop'])
  })

  it('petite vignette (« hover ») : au survol seulement', () => {
    const small = fake('hover')
    const [id] = setup(POINTER, small)
    director.visibility(id, 1)
    idle()
    expect(small.calls).toEqual([])
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS)
    expect(small.calls).toEqual(['loop'])
  })
})

describe('sur écran tactile', () => {
  it('la carte la plus proche du centre parmi celles visibles à 60 % démarre après l’arrêt du défilement, une seule fois', () => {
    const top = fake('card', 300)
    const middle = fake('card', 20)
    const half = fake('card', 0)
    const [idTop, idMiddle, idHalf] = setup(TOUCH, top, middle, half)
    director.visibility(idTop, 1)
    director.visibility(idMiddle, 1)
    // au centre, mais visible à moins de 60 % : écartée
    director.visibility(idHalf, 0.5)
    vi.advanceTimersByTime(IDLE_MS - 50)
    director.scrolled()
    vi.advanceTimersByTime(IDLE_MS - 50)
    expect(middle.calls, 'le défilement repousse le choix').toEqual([])
    vi.advanceTimersByTime(50)
    expect(middle.calls).toEqual(['once'])
    expect(top.calls).toEqual([])
    expect(half.calls).toEqual([])
    expect(director.current).toMatchObject({ id: idMiddle, loop: false, by: 'auto' })
  })

  it('fin de l’extrait : retour à l’image, la carte voisine ne prend pas le relais sans nouveau défilement', () => {
    const a = fake('card', 10)
    const b = fake('card', 50)
    const [ida, idb] = setup(TOUCH, a, b)
    director.visibility(ida, 1)
    director.visibility(idb, 1)
    idle()
    expect(a.calls).toEqual(['once'])
    director.ended(ida)
    idle()
    expect(a.calls).toEqual(['once', 'stop'])
    expect(b.calls).toEqual([])
    // nouveau défilement : la carte déjà jouée est écartée, la suivante démarre
    director.scrolled()
    idle()
    expect(b.calls).toEqual(['once'])
    expect(a.calls).toEqual(['once', 'stop'])
  })

  it('une carte déjà jouée ne rejoue qu’après être sortie de l’écran puis revenue', () => {
    const a = fake('card', 0)
    const [id] = setup(TOUCH, a)
    director.visibility(id, 1)
    idle()
    director.ended(id)
    director.scrolled()
    idle()
    expect(a.calls).toEqual(['once', 'stop'])
    // encore partiellement visible : toujours « jouée »
    director.visibility(id, 0.3)
    director.visibility(id, 1)
    idle()
    expect(a.calls).toEqual(['once', 'stop'])
    director.visibility(id, 0)
    director.visibility(id, 1)
    idle()
    expect(a.calls).toEqual(['once', 'stop', 'once'])
  })

  it('une autre carte devient la plus proche du centre : elle prend la place (un seul aperçu à la fois)', () => {
    const a = fake('card', 10)
    const b = fake('card', 80)
    const [ida, idb] = setup(TOUCH, a, b)
    director.visibility(ida, 1)
    director.visibility(idb, 1)
    idle()
    a.distance = 200
    b.distance = 5
    director.scrolled()
    idle()
    expect(a.calls).toEqual(['once', 'stop'])
    expect(b.calls).toEqual(['once'])
  })

  it('aperçu moins visible pendant sa lecture : il va jusqu’au bout ; sorti de l’écran : il s’arrête', () => {
    const a = fake('card', 0)
    const [id] = setup(TOUCH, a)
    director.visibility(id, 1)
    idle()
    director.visibility(id, 0.4)
    idle()
    expect(director.current?.id).toBe(id)
    director.visibility(id, 0)
    expect(a.calls).toEqual(['once', 'stop'])
  })

  it('à égalité de distance (deux cartes côte à côte), la première de la page', () => {
    const left = fake('card', 90)
    const right = fake('card', 90)
    const [idl, idr] = setup(TOUCH, left, right)
    director.visibility(idr, 1)
    director.visibility(idl, 1)
    idle()
    expect(director.current?.id).toBe(idl)
  })

  it('écart de quelques pixels (arrondis du navigateur) : toujours la première ; écart réel : la plus proche', () => {
    const left = fake('card', 92.6)
    const right = fake('card', 92.4)
    const below = fake('card', 300)
    const [idl, idr, idb] = setup(TOUCH, left, right, below)
    for (const id of [idl, idr, idb]) director.visibility(id, 1)
    idle()
    expect(director.current?.id).toBe(idl)
    director.ended(idl)
    // la carte de droite, nettement plus proche que celle du dessous, l'emporte au défilement suivant
    director.scrolled()
    idle()
    expect(director.current?.id).toBe(idr)
  })

  it('lecture unique limitée à 5 s après le vrai démarrage (WCAG 2.2.2), même si l’extrait est plus long', () => {
    const a = fake('card', 0)
    const [id] = setup(TOUCH, a)
    director.visibility(id, 1)
    idle()
    // chargement : le décompte ne commence qu'à l'événement « playing »
    vi.advanceTimersByTime(AUTO_MAX_MS)
    expect(a.calls).toEqual(['once'])
    director.playing(id)
    // nouvelle reprise après une attente de chargement : le décompte ne repart pas de zéro
    vi.advanceTimersByTime(AUTO_MAX_MS - 1)
    director.playing(id)
    vi.advanceTimersByTime(1)
    expect(a.calls).toEqual(['once', 'stop'])
  })

  it('le survol (pointeur tactile) est ignoré ; les petites vignettes ne démarrent jamais seules', () => {
    const card = fake('card', 50)
    const small = fake('hover', 0)
    const [idc, ids] = setup(TOUCH, card, small)
    director.visibility(idc, 1)
    director.visibility(ids, 1)
    director.pointerEnter(ids)
    vi.advanceTimersByTime(HOVER_MS)
    idle()
    expect(small.calls).toEqual([])
    expect(card.calls).toEqual(['once'])
  })
})

describe('lecteur d’une fiche', () => {
  it('en boucle tant qu’il est visible ; une carte survolée prend la place, puis il reprend', () => {
    const player = fake('ambient')
    const card = fake('card')
    const [idp, idc] = setup(POINTER, player, card)
    director.visibility(idp, 0.5)
    idle()
    expect(player.calls, 'moins de 60 % visible au départ').toEqual([])
    director.visibility(idp, 1)
    idle()
    expect(player.calls).toEqual(['loop'])
    director.visibility(idc, 1)
    director.pointerEnter(idc)
    vi.advanceTimersByTime(HOVER_MS)
    expect(player.calls).toEqual(['loop', 'stop'])
    expect(card.calls).toEqual(['loop'])
    director.pointerLeave(idc)
    idle()
    expect(player.calls).toEqual(['loop', 'stop', 'loop'])
    // toujours en boucle : aucune limite de durée (bouton pause à la place)
    director.playing(idp)
    vi.advanceTimersByTime(AUTO_MAX_MS * 3)
    expect(director.current).toMatchObject({ id: idp, loop: true })
  })

  it('bouton pause : arrêt, pas de reprise au choix suivant ; « Relancer l’aperçu » le relance', () => {
    const player = fake('ambient')
    const [id] = setup(TOUCH, player)
    director.visibility(id, 1)
    idle()
    director.setPaused(id, true)
    director.scrolled()
    idle()
    expect(player.calls).toEqual(['loop', 'stop'])
    director.setPaused(id, false)
    expect(player.calls).toEqual(['loop', 'stop', 'loop'])
  })

  it('sur écran tactile, une carte jouée seule passe avant lui, puis il reprend à la fin de l’extrait', () => {
    const player = fake('ambient', 400)
    const card = fake('card', 10)
    const [idp, idc] = setup(TOUCH, player, card)
    director.visibility(idp, 1)
    director.visibility(idc, 1)
    idle()
    expect(card.calls).toEqual(['once'])
    expect(player.calls).toEqual([])
    director.ended(idc)
    idle()
    expect(player.calls).toEqual(['loop'])
  })

  it('sorti de l’écran : arrêt', () => {
    const player = fake('ambient')
    const [id] = setup(POINTER, player)
    director.visibility(id, 1)
    idle()
    director.visibility(id, 0)
    expect(player.calls).toEqual(['loop', 'stop'])
  })
})

describe('préférences et onglet', () => {
  it('« réduire les animations » ou économie de données : rien ne démarre, ni au survol, ni seul', () => {
    const card = fake('card')
    const tile = fake('feature')
    const player = fake('ambient')
    const [idc, idt, idp] = setup({ ...POINTER, allowed: false }, card, tile, player)
    director.visibility(idt, 1)
    director.visibility(idp, 1)
    director.focusIn(idc)
    director.pointerEnter(idc)
    vi.advanceTimersByTime(HOVER_MS)
    idle()
    director.setPaused(idp, false)
    expect([...card.calls, ...tile.calls, ...player.calls]).toEqual([])
  })

  it('préférence activée pendant un aperçu : arrêt immédiat', () => {
    const card = fake('card')
    const [id] = setup(POINTER, card)
    director.focusIn(id)
    director.setEnv({ allowed: false })
    expect(card.calls).toEqual(['loop', 'stop'])
    idle()
    expect(card.calls).toEqual(['loop', 'stop'])
  })

  it('onglet masqué : arrêt ; de retour, le choix reprend (la carte encore survolée repart)', () => {
    const card = fake('card')
    const [id] = setup(POINTER, card)
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS)
    director.setEnv({ hidden: true })
    expect(card.calls).toEqual(['loop', 'stop'])
    idle()
    expect(card.calls).toEqual(['loop', 'stop'])
    director.setEnv({ hidden: false })
    idle()
    expect(card.calls).toEqual(['loop', 'stop', 'loop'])
  })

  it('passage de la souris à l’écran tactile (ou l’inverse) : l’aperçu en cours s’arrête', () => {
    const card = fake('card', 0)
    const [id] = setup(POINTER, card)
    director.visibility(id, 1)
    director.pointerEnter(id)
    vi.advanceTimersByTime(HOVER_MS)
    director.setEnv({ pointer: false })
    expect(card.calls).toEqual(['loop', 'stop'])
  })

  it('aperçu retiré (carte démontée ou fichier illisible) : arrêté et plus jamais proposé', () => {
    const a = fake('card', 0)
    const b = fake('card', 50)
    const [ida, idb] = setup(TOUCH, a, b)
    director.visibility(ida, 1)
    director.visibility(idb, 1)
    idle()
    director.unregister(ida)
    expect(a.calls).toEqual(['once', 'stop'])
    director.scrolled()
    idle()
    expect(b.calls).toEqual(['once'])
    // événements tardifs d'un aperçu retiré : sans effet
    director.visibility(ida, 1)
    director.pointerEnter(ida)
    director.ended(ida)
    idle()
    expect(a.calls).toEqual(['once', 'stop'])
  })
})
