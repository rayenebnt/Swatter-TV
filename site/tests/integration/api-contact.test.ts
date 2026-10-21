// Tests d'intégration du formulaire « Proposer une info » (POST /api/contact) : validation (erreurs en français), robots,
// 5 messages par quart d'heure et par adresse IP, message enregistré dans « Messages reçus », e-mail envoyé à la
// rédaction (payload.sendEmail espionné), échec d'envoi sans perte du message.
import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Message } from '@/payload-types'
import { apiJson, testPayload, unique } from './helpers'
import { fromIp, newIp } from './api-outils'

type Answer = { ok?: boolean; error?: string; errors?: Record<string, string> }
type Mail = { to: string; replyTo?: string; subject: string; text: string; html: string }

const CONTEXT = { disableRevalidate: true }

let payload: Payload
let sendEmail: MockInstance

beforeEach(async () => {
  payload = await testPayload()
  sendEmail = vi.spyOn(payload, 'sendEmail')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Message tel que l'envoie le formulaire (case cochée, champ piège vide, 5 s après l'affichage), adresse unique. */
const form = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  subject: 'info',
  name: 'Jeanne Martin',
  email: `${unique('contact')}@example.com`,
  phone: '06 12 34 56 78',
  city: 'Thônes',
  link: 'https://photos.example/album',
  message: 'Un éboulement bloque la route du col de la Croix-Fry depuis ce matin.',
  consent: true,
  website: '',
  elapsed: 5000,
  ...extra,
})

const send = (body: unknown, ip = newIp(), headers: Record<string, string> = {}) => apiJson<Answer>('/contact', { body, headers: fromIp(ip, headers) })

/** Messages enregistrés depuis cette adresse e-mail. */
async function messagesFrom(email: unknown): Promise<Message[]> {
  if (typeof email !== 'string') return []
  return (await payload.find({ collection: 'messages', where: { email: { equals: email } }, depth: 0, overrideAccess: true })).docs
}

const mails = (): Mail[] => sendEmail.mock.calls.map(([mail]) => mail as Mail)

describe('formulaire de contact', () => {
  it('contact : un message valide est enregistré dans « Messages reçus » puis envoyé à la rédaction', async () => {
    const body = form()
    const res = await send(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })

    const [saved, ...more] = await messagesFrom(body.email)
    expect(more).toEqual([])
    expect(saved).toMatchObject({
      subject: 'info',
      name: 'Jeanne Martin',
      email: body.email,
      phone: '06 12 34 56 78',
      city: 'Thônes',
      link: 'https://photos.example/album',
      message: body.message,
      handled: false,
      // pas de SMTP pendant les tests : rien n'est vraiment parti
      emailed: false,
    })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [mail] = mails()
    // adresse de contact des réglages (contact@swatter-tv.fr sur une base neuve, voir le test suivant)
    const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
    expect(mail.to).toBe(settings.contact?.email?.trim() || 'contact@swatter-tv.fr')
    expect(mail.replyTo).toBe(`Jeanne Martin <${body.email}>`)
    expect(mail.subject).toBe('Proposition d’info — Jeanne Martin (Thônes)')
    for (const part of [
      'Sujet : Proposer une info',
      'Nom : Jeanne Martin',
      `E-mail : ${body.email}`,
      'Téléphone : 06 12 34 56 78',
      'Commune : Thônes',
      'Lien : https://photos.example/album',
    ]) {
      expect(mail.text).toContain(part)
    }
    expect(mail.text).toContain(String(body.message))
    expect(mail.html).toContain(String(body.message))
  })

  it('contact : l’e-mail part à l’adresse de contact des réglages, à défaut à contact@swatter-tv.fr', async () => {
    const original = (await payload.findGlobal({ slug: 'settings', depth: 0 })).contact?.email ?? null
    const setContact = (email: string | null) =>
      payload.updateGlobal({ slug: 'settings', data: { contact: { email }, _status: 'published' }, context: CONTEXT })
    try {
      await setContact('redaction-tests@swatter-tv.fr')
      expect((await send(form())).body).toEqual({ ok: true })
      await setContact(null)
      expect((await send(form())).body).toEqual({ ok: true })
      expect(mails().map((m) => m.to)).toEqual(['redaction-tests@swatter-tv.fr', 'contact@swatter-tv.fr'])
    } finally {
      await setContact(original)
    }
  })

  it('contact : objet de l’e-mail selon le sujet (publicité, autre) ; un sujet inconnu devient « Proposer une info »', async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ subject: 'publicite' }, 'publicite', 'Demande de partenariat — Jeanne Martin (Thônes)'],
      [{ subject: 'autre', city: '' }, 'autre', 'Message — Jeanne Martin'],
      [{ subject: 'n’importe quoi', city: undefined }, 'info', 'Proposition d’info — Jeanne Martin'],
    ]
    for (const [extra, subject, mailSubject] of cases) {
      const body = form(extra)
      expect((await send(body)).body).toEqual({ ok: true })
      expect((await messagesFrom(body.email))[0]?.subject).toBe(subject)
      expect(mails().at(-1)?.subject).toBe(mailSubject)
    }
  })

  it.each<[string, Record<string, unknown>, Record<string, string>]>([
    ['nom trop court', { name: 'J' }, { name: 'Indiquez votre nom.' }],
    ['adresse e-mail invalide', { email: 'jeanne@exemple' }, { email: 'Indiquez une adresse e-mail valide, pour que la rédaction puisse vous répondre.' }],
    ['message de moins de 10 caractères', { message: 'Bonjour' }, { message: 'Votre message est trop court (10 caractères au moins).' }],
    ['lien javascript:', { link: 'javascript:alert(1)' }, { link: 'Le lien doit commencer par https://' }],
    ['lien ftp', { link: 'ftp://photos.example/album' }, { link: 'Le lien doit commencer par https://' }],
    ['lien avec une espace', { link: 'https://photos.example/mon album' }, { link: 'Le lien doit commencer par https://' }],
    ['case de consentement non cochée', { consent: false }, { consent: 'Cochez cette case pour envoyer votre message.' }],
    ['case de consentement absente', { consent: undefined }, { consent: 'Cochez cette case pour envoyer votre message.' }],
  ])('contact : %s → refus (400) avec le message sous le champ ; rien n’est enregistré ni envoyé', async (_, extra, errors) => {
    const body = form(extra)
    const res = await send(body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ errors })
    expect(await messagesFrom(body.email)).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('contact : tous les champs obligatoires manquants sont signalés ensemble', async () => {
    const res = await send({ website: '', elapsed: 5000 })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors ?? {}).sort()).toEqual(['consent', 'email', 'message', 'name'])
  })

  it('contact : consentement envoyé en texte (« on », « true ») accepté ; téléphone, commune et lien facultatifs', async () => {
    for (const consent of ['on', 'true']) {
      const body = form({ consent, phone: undefined, city: undefined, link: undefined })
      expect((await send(body)).body).toEqual({ ok: true })
      expect(await messagesFrom(body.email)).toHaveLength(1)
    }
  })

  it.each(['pas du json', 'null', ''])('contact : un corps illisible (%j) est refusé (400)', async (raw) => {
    const res = await send(raw)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Requête illisible.' })
  })

  it.each<[string, Record<string, unknown>]>([
    ['champ piège rempli', { website: 'https://spam.example' }],
    ['envoi 1 s après l’affichage', { elapsed: 1000 }],
    ['sans durée', { elapsed: undefined }],
    ['durée illisible', { elapsed: 'abc' }],
    ['robot aux champs invalides', { website: 'x', email: 'pas-une-adresse', message: '' }],
  ])('contact : un robot (%s) reçoit une réponse polie ; rien n’est enregistré ni envoyé', async (_, extra) => {
    const body = form(extra)
    const res = await send(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(await messagesFrom(body.email)).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('contact : un envoi qui ne vient pas du formulaire (tableau JSON) est traité comme un robot', async () => {
    const before = (await payload.count({ collection: 'messages', overrideAccess: true })).totalDocs
    const res = await send([form()])
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect((await payload.count({ collection: 'messages', overrideAccess: true })).totalDocs).toBe(before)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('contact : 5 messages par quart d’heure et par adresse IP ; les envois refusés et ceux des robots ne comptent pas', async () => {
    const proxy = newIp()
    // refusés ou robots : ne comptent pas
    for (const extra of [{ name: '' }, { consent: false }, { website: 'spam' }, { elapsed: 10 }]) await send(form(extra), proxy)
    for (let i = 0; i < 5; i++) expect((await send(form(), proxy)).body, `message ${i + 1}`).toEqual({ ok: true })
    // le sixième, même avec un premier maillon X-Forwarded-For inventé, est refusé
    const body = form()
    const res = await apiJson<Answer>('/contact', { body, headers: { 'x-forwarded-for': `203.0.113.9, ${proxy}` } })
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Trop de messages envoyés d’un coup : réessayez dans quelques minutes.' })
    expect(await messagesFrom(body.email)).toEqual([])
    expect(sendEmail).toHaveBeenCalledTimes(5)
    // une autre adresse IP n'est pas touchée
    expect((await send(form())).body).toEqual({ ok: true })
  })

  it('contact : les textes sont nettoyés (caractères de contrôle, espaces, longueur) ; le message garde ses retours à la ligne', async () => {
    const body = form({
      name: '  Jeanne\u0000 Martin\u0007  ',
      city: `  ${'c'.repeat(150)}  `,
      message: `  Ligne 1\nLigne 2\u0000\u0008 fin\r\nLigne 3 ${'m'.repeat(6000)}`,
    })
    expect((await send(body)).body).toEqual({ ok: true })
    const [saved] = await messagesFrom(body.email)
    expect(saved.name).toBe('Jeanne Martin')
    expect(saved.city).toBe('c'.repeat(120))
    expect(saved.message.startsWith('Ligne 1\nLigne 2 fin\r\nLigne 3 ')).toBe(true)
    expect(saved.message).toHaveLength(5000)
  })

  it('contact : le contenu est échappé dans l’e-mail HTML, l’adresse de réponse reste celle de l’expéditeur', async () => {
    const body = form({ name: '<script>alert(1)</script> "Bob" <bob@pirate.example>', message: '<img src=x onerror=alert(1)> Une info à vérifier.' })
    expect((await send(body)).body).toEqual({ ok: true })
    const [mail] = mails()
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(mail.replyTo).toBe(`scriptalert(1)/script Bob bob@pirate.example <${body.email}>`)
  })

  it('contact : un échec d’envoi de l’e-mail n’empêche pas l’enregistrement du message', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP indisponible'))
    const logged = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    const body = form()
    const res = await send(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(await messagesFrom(body.email)).toMatchObject([{ email: body.email, emailed: false, handled: false }])
    expect(logged).toHaveBeenCalledTimes(1)
  })
})
