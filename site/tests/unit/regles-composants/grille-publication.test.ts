// Créneaux de la grille restés en brouillon et émissions pas en ligne (src/components/admin/slotPublication.ts,
// src/lib/schedule-programs.ts) : état lu dans la liste de l'administration (badge « pas en ligne » / « modifié, à
// publier »), bandeaux « N créneaux à publier » et « L’émission … n’est pas en ligne », et publication d'un clic (une
// requête par fiche, comme « Publier les modifications ») : refus nommés avec leur raison, connexion coupée, progression.
import { describe, expect, it, vi } from 'vitest'
import {
  findOfflinePrograms,
  offlineProgramsNotice,
  programIds,
  publishPrograms,
  publishSlots,
  refusalReason,
  slotName,
  slotPublication,
  unpublishedDetail,
  unpublishedSlots,
} from '@/components/admin/slotPublication'
import { offlineProgramMessage, programIdOf, programName } from '@/lib/schedule-programs'

describe('état de publication d’un créneau de la liste', () => {
  it('jamais publié, modifié sans être republié, en ligne', () => {
    expect(slotPublication({ _displayStatus: 'draft', _status: 'draft' })).toBe('draft')
    expect(slotPublication({ _displayStatus: 'changed', _status: 'draft' })).toBe('changed')
    expect(slotPublication({ _displayStatus: 'published', _status: 'published' })).toBeNull()
  })

  it('sans l’état calculé par la liste : le statut de la dernière version', () => {
    expect(slotPublication({ _status: 'draft' })).toBe('draft')
    expect(slotPublication({ _status: 'published' })).toBeNull()
    expect(slotPublication(null)).toBeNull()
    expect(slotPublication({})).toBeNull()
  })

  it('créneaux à publier d’une liste, dans son ordre, comptés par sorte', () => {
    const docs = [
      { id: 1, _displayStatus: 'published', label: 'A' },
      { id: 2, _displayStatus: 'draft', label: '02/11/2026 20:00 — Journal', startsAt: '2026-11-02T19:00:00.000Z' },
      { id: 3, _displayStatus: 'changed' },
      { _displayStatus: 'draft' }, // sans numéro : ignoré
      { id: 4, _status: 'draft', label: 42 },
    ]
    expect(unpublishedSlots(docs)).toEqual({
      slots: [
        { id: 2, label: '02/11/2026 20:00 — Journal', startsAt: '2026-11-02T19:00:00.000Z' },
        { id: 3, label: undefined, startsAt: undefined },
        { id: 4, label: undefined, startsAt: undefined },
      ],
      draft: 2,
      changed: 1,
    })
    expect(unpublishedSlots(undefined)).toEqual({ slots: [], draft: 0, changed: 0 })
  })
})

describe('bandeau « N créneaux à publier »', () => {
  it('jamais publiés, modifiés, ou les deux (comptés)', () => {
    expect(unpublishedDetail(1, 0)).toBe('jamais publié : invisible sur le site')
    expect(unpublishedDetail(3, 0)).toBe('jamais publiés : invisibles sur le site')
    expect(unpublishedDetail(0, 1)).toBe('modifié sans être republié : le site montre encore l’ancienne version')
    expect(unpublishedDetail(0, 2)).toBe('modifiés sans être republiés : le site montre encore l’ancienne version')
    expect(unpublishedDetail(2, 1)).toBe('2 jamais publiés : invisibles sur le site ; 1 modifié sans être republié : le site montre encore l’ancienne version')
  })

  it('nom d’un créneau dans un message : son intitulé, sinon son jour et son heure, sinon son numéro', () => {
    expect(slotName({ id: 1, label: '02/11/2026 20:00 — Journal' })).toBe('02/11/2026 20:00 — Journal')
    // lundi 2 novembre 2026, 20 h à Paris (heure d'hiver)
    expect(slotName({ id: 2, startsAt: '2026-11-02T19:00:00.000Z' })).toBe('02/11/2026 20:00')
    // mardi 0 h 15 : rattaché à la soirée du lundi
    expect(slotName({ id: 3, startsAt: '2026-11-02T23:15:00.000Z' })).toBe('Soirée du 02/11/2026, 00:15')
    expect(slotName({ id: 4 })).toBe('Créneau n° 4')
  })
})

describe('raison d’un refus de Payload', () => {
  it('détail des champs refusés, sinon le message général', () => {
    const invalid = {
      errors: [
        {
          name: 'ValidationError',
          message: 'Le champ suivant n’est pas valide : Émission',
          data: { errors: [{ label: 'Émission', message: 'Ce champ est requis.', path: 'program' }] },
        },
      ],
    }
    expect(refusalReason(invalid)).toBe('Émission : Ce champ est requis.')
    const two = { errors: [{ data: { errors: [{ label: 'Durée (minutes)', message: 'Trop long.' }, { message: 'Sans libellé.' }] } }] }
    expect(refusalReason(two)).toBe('Durée (minutes) : Trop long. ; Sans libellé.')
    expect(refusalReason({ errors: [{ message: 'Vous n’êtes pas autorisé à effectuer cette action.' }] })).toBe('Vous n’êtes pas autorisé à effectuer cette action.')
    expect(refusalReason(null)).toBe('publication refusée')
    expect(refusalReason('Bad Gateway')).toBe('publication refusée')
  })
})

describe('publication d’un clic', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('un créneau à la fois, dernière version publiée ; un refus nommé n’arrête pas les suivants', async () => {
    const request = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/schedule/2?')
        ? json(400, { errors: [{ message: 'invalide', data: { errors: [{ label: 'Émission', message: 'Ce champ est requis.' }] } }] })
        : json(200, { doc: {} }),
    )
    const progress: number[] = []
    const result = await publishSlots('/api', [{ id: 1 }, { id: 2, label: '03/11/2026 21:00' }, { id: 3 }], (done) => progress.push(done), request as typeof fetch)
    expect(result).toEqual({ published: 2, refused: ['03/11/2026 21:00 : Émission : Ce champ est requis.'], interrupted: 0 })
    expect(progress).toEqual([1, 2, 3])
    expect(request).toHaveBeenCalledTimes(3)
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/schedule/1?depth=0')
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include', body: JSON.stringify({ _status: 'published' }) })
  })

  it('réponse illisible : refus générique, sans plantage', async () => {
    const request = vi.fn(async () => new Response('<html>502</html>', { status: 502 }))
    expect(await publishSlots('/api', [{ id: 7 }], undefined, request as typeof fetch)).toEqual({ published: 0, refused: ['Créneau n° 7 : publication refusée'], interrupted: 0 })
  })

  it('connexion coupée : arrêt aussitôt, le reste est compté', async () => {
    let calls = 0
    const request = vi.fn(async () => {
      if (++calls === 2) throw new TypeError('Failed to fetch')
      return json(200, { doc: {} })
    })
    const progress: number[] = []
    const result = await publishSlots('/api', [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], (done) => progress.push(done), request as typeof fetch)
    expect(result).toEqual({ published: 1, refused: [], interrupted: 3 })
    expect(progress).toEqual([1])
    expect(request).toHaveBeenCalledTimes(2)
  })
})

describe('émissions pas en ligne', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('numéro de l’émission d’un créneau, nom dans un message', () => {
    expect(programIdOf(3)).toBe(3)
    expect(programIdOf({ id: 4, title: 'Le journal' })).toBe(4)
    expect(programIdOf(null)).toBeNull()
    expect(programIdOf('5')).toBeNull()
    expect(programIds([{ program: 3 }, { program: { id: 4 } }, { program: 3 }, { program: null }, null])).toEqual([3, 4])
    expect(programName({ id: 2, title: 'Le Yodleur' })).toBe('« Le Yodleur »')
    expect(programName({ id: 9, title: null })).toBe('n° 9 (sans titre)')
  })

  it('refus d’un créneau dont l’émission n’est pas en ligne : son nom, et quoi faire', () => {
    expect(offlineProgramMessage('Le Yodleur des cimes')).toBe(
      '« Le Yodleur des cimes » n’est pas en ligne : ouvrez-la (Programme TV › Émissions) et cliquez sur « Publier les modifications », puis publiez ce créneau (une émission doit être publiée pour apparaître dans le programme du site).',
    )
    expect(offlineProgramMessage(null)).toMatch(/^Cette émission n’est pas en ligne : /)
  })

  it('bandeau : une émission, ou plusieurs (nommées)', () => {
    expect(offlineProgramsNotice([{ id: 2, title: 'Le Yodleur' }])).toEqual({
      title: 'L’émission « Le Yodleur » n’a jamais été publiée',
      rest: expect.stringMatching(/^ : sur le site, ses créneaux s’affichent sans son nom \(sous le titre « Programme »\)/),
    })
    const many = offlineProgramsNotice([
      { id: 2, title: 'Le Yodleur' },
      { id: 9, title: null },
    ])
    expect(many.title).toBe('2 émissions n’ont jamais été publiées')
    expect(many.rest).toMatch(/^ \(« Le Yodleur », n° 9 \(sans titre\)\) : sur le site, leurs créneaux s’affichent sans leur nom/)
  })

  it('recherche : fiches principales en brouillon et vides (jamais publiées), nommées d’après leur dernière version', async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      const query = new URL(String(url), 'http://site').searchParams
      if (query.get('draft') === 'true') return json(200, { docs: [{ id: 2, title: 'Le Yodleur' }, { id: 9, title: '' }] })
      // n° 5 : retirée du site, son nom reste en ligne
      return json(200, { docs: [{ id: 2, title: null }, { id: 5, title: 'La météo' }, { id: 9, title: null }] })
    })
    expect(await findOfflinePrograms('/api', [1, 2, 5, 9], undefined, request as typeof fetch)).toEqual([
      { id: 2, title: 'Le Yodleur' },
      { id: 9, title: null },
    ])
    const first = new URL(String(request.mock.calls[0][0]), 'http://site').searchParams
    expect(first.get('where[and][0][id][in]')).toBe('1,2,5,9')
    expect(first.get('where[and][1][_status][equals]')).toBe('draft')
    expect(first.get('draft')).toBeNull()
    const second = new URL(String(request.mock.calls[1][0]), 'http://site').searchParams
    expect(second.get('draft')).toBe('true')
    expect(second.get('where[id][in]')).toBe('2,9')
  })

  it('recherche : rien à chercher, toutes en ligne, ou réponse refusée', async () => {
    const request = vi.fn(async () => json(200, { docs: [] }))
    expect(await findOfflinePrograms('/api', [], undefined, request as typeof fetch)).toEqual([])
    expect(request).not.toHaveBeenCalled()
    expect(await findOfflinePrograms('/api', [1, 2], undefined, request as typeof fetch)).toEqual([])
    expect(request).toHaveBeenCalledTimes(1)
    const refused = vi.fn(async () => json(403, { errors: [{ message: 'Non autorisé' }] }))
    expect(await findOfflinePrograms('/api', [1], undefined, refused as typeof fetch)).toEqual([])
  })

  it('publication d’un clic des émissions : refus nommés par leur titre', async () => {
    const request = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/programs/9?') ? json(400, { errors: [{ data: { errors: [{ label: 'Titre', message: 'Ce champ est requis.' }] } }] }) : json(200, { doc: {} }),
    )
    const result = await publishPrograms(
      '/api',
      [
        { id: 2, title: 'Le Yodleur' },
        { id: 9, title: null },
      ],
      undefined,
      request as typeof fetch,
    )
    expect(result).toEqual({ published: 1, refused: ['Émission n° 9 (sans titre) : Titre : Ce champ est requis.'], interrupted: 0 })
    expect(String(request.mock.calls[0][0])).toBe('/api/programs/2?depth=0')
  })
})
