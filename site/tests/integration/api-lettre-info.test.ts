// Tests d'intégration de l'export de la lettre d'info (GET /api/membres/lettre-info.csv) : réservé aux administrateurs,
// membres non suspendus qui acceptent les e-mails, fichier pour Excel (BOM UTF-8, point-virgule, lignes CRLF), formules
// neutralisées, date d'inscription au jour de Paris.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parisDay } from '@/lib/format'
import { adminToken, api, apiJson, editorToken, unique } from './helpers'
import { adminUpdateMember, asMember, findMember, signup, type TestMember } from './api-outils'

const HEADER = 'Prénom;Nom;E-mail;Département;Inscrit le'

/** Membre inscrit sur le site, puis profil complété comme dans « Mon profil ». */
async function member(firstName: string, profile: Record<string, unknown>, email?: string): Promise<TestMember> {
  const m = await signup({ firstName, ...(email ? { email } : {}) })
  if (Object.keys(profile).length) {
    const res = await asMember(m, m.jar, '/compte/profil', { method: 'PATCH', body: profile })
    if (res.status !== 200) throw new Error(`Profil de ${m.email} non enregistré (${res.status})`)
  }
  return m
}

/** Fichier téléchargé : réponse, octets bruts et texte (BOM conservé). */
async function download() {
  const res = await api('/membres/lettre-info.csv', { token: await adminToken() })
  const bytes = new Uint8Array(await res.arrayBuffer())
  return { res, bytes, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) }
}

const lineOf = (text: string, m: TestMember) => text.split('\r\n').find((line) => line.includes(m.email))

/** Jour d'inscription du membre, heure de Paris. */
const signupDay = async (m: TestMember) => parisDay((await findMember(m.email))?.createdAt ?? '')

let alice: TestMember
let bruno: TestMember
let chloe: TestMember
let formula: TestMember
let signs: TestMember
let quotes: TestMember
let tab: TestMember
let withdrawn: TestMember
let deleted: TestMember

beforeAll(async () => {
  // inscriptions l'une après l'autre : l'ordre d'inscription est celui du fichier
  alice = await member('Alice', { lastName: 'Martin', department: 'haute-savoie', newsletter: true })
  bruno = await member('Bruno', {})
  chloe = await member('Chloé', { newsletter: true })
  formula = await member('=HYPERLINK("https://piege.example","Cliquez")', { lastName: '+33 6 12 34 56 78', newsletter: true })
  signs = await member('-2+3', { lastName: '@SUM(A1)', newsletter: true }, `=calc-${unique('csv')}@example.com`)
  quotes = await member('Zoé', { lastName: 'Dupont; Durand "le grand"', department: 'isere', newsletter: true })
  tab = await member('Tom', { newsletter: true })
  withdrawn = await member('Wanda', { newsletter: true })
  deleted = await member('Denis', { newsletter: true })

  // compte suspendu par l'équipe, nom corrigé dans l'administration, accord retiré, compte supprimé
  await adminUpdateMember(chloe.id, { blocked: true })
  await adminUpdateMember(tab.id, { lastName: '\t=1+1' })
  await asMember(withdrawn, withdrawn.jar, '/compte/profil', { method: 'PATCH', body: { newsletter: false } })
  const removed = await asMember(deleted, deleted.jar, '/compte/supprimer', { body: { password: deleted.password } })
  if (removed.status !== 200) throw new Error('Suppression du compte impossible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('export de la lettre d’info', () => {
  it('lettre d’info : réservée aux administrateurs (visiteur, membre connecté et éditeur refusés)', async () => {
    const cases: [string, { cookie?: string; token?: string }][] = [
      ['visiteur', {}],
      ['membre connecté', { cookie: alice.jar.header() }],
      ['éditeur', { token: await editorToken() }],
    ]
    for (const [label, options] of cases) {
      const res = await apiJson('/membres/lettre-info.csv', options)
      expect(res.status, label).toBe(403)
      expect(res.body, label).toEqual({ error: 'Réservé aux administrateurs.' })
    }
    expect((await download()).res.status).toBe(200)
  })

  it('lettre d’info : fichier CSV pour Excel (BOM UTF-8, point-virgule, lignes CRLF), en pièce jointe', async () => {
    const { res, bytes, text } = await download()
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="membres-lettre-info-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(text.startsWith(`﻿${HEADER}\r\n`)).toBe(true)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(lineOf(text, alice)?.split(';')).toHaveLength(5)
  })

  it('lettre d’info : seulement les membres non suspendus qui acceptent les e-mails, du premier inscrit au dernier', async () => {
    const { text } = await download()
    const lines = text.split('\r\n')
    const indexOf = (m: TestMember) => lines.findIndex((line) => line.includes(m.email))
    // refusé, suspendu, accord retiré, compte supprimé : absents
    for (const m of [bruno, chloe, withdrawn, deleted]) expect(indexOf(m), m.firstName).toBe(-1)
    const order = [alice, formula, signs, quotes, tab].map(indexOf)
    for (const i of order) expect(i).toBeGreaterThan(0)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(lineOf(text, alice)).toBe(`Alice;Martin;${alice.email};Haute-Savoie;${await signupDay(alice)}`)
  })

  it('lettre d’info : une valeur qui commence par = + - @ ou une tabulation reste du texte ; ; et " sont mis entre guillemets', async () => {
    const { text } = await download()
    expect(lineOf(text, formula)).toBe(`"'=HYPERLINK(""https://piege.example"",""Cliquez"")";'+33 6 12 34 56 78;${formula.email};;${await signupDay(formula)}`)
    // l'adresse elle-même peut commencer par « = »
    expect(signs.email.startsWith('=')).toBe(true)
    expect(lineOf(text, signs)).toBe(`'-2+3;'@SUM(A1);'${signs.email};;${await signupDay(signs)}`)
    expect(lineOf(text, quotes)).toBe(`Zoé;"Dupont; Durand ""le grand""";${quotes.email};Isère;${await signupDay(quotes)}`)
    expect(lineOf(text, tab)).toBe(`Tom;'\t=1+1;${tab.email};;${await signupDay(tab)}`)
  })

  it('lettre d’info : la date d’inscription est celle du jour à Paris (inscription le 21 octobre à 0 h 30)', async () => {
    // 20 octobre 22 h 30 UTC = 21 octobre 0 h 30 à Paris (heure d'été)
    vi.setSystemTime(new Date('2026-10-20T22:30:00.000Z'))
    let night: TestMember
    try {
      night = await member('Noctambule', { newsletter: true })
    } finally {
      vi.useRealTimers()
    }
    expect((await findMember(night.email))?.createdAt).toBe('2026-10-20T22:30:00.000Z')
    const { text } = await download()
    expect(lineOf(text, night)).toBe(`Noctambule;;${night.email};;2026-10-21`)
  })

  it('lettre d’info : le nom du fichier porte la date du jour à Paris (export le 21 octobre à 0 h 30)', async () => {
    const token = await adminToken()
    vi.setSystemTime(new Date('2026-10-20T22:30:00.000Z'))
    try {
      const res = await api('/membres/lettre-info.csv', { token })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="membres-lettre-info-2026-10-21.csv"')
    } finally {
      vi.useRealTimers()
    }
  })
})
