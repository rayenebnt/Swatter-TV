// Espace membres : e-mail « nouveau mot de passe » (HTML et texte brut) et envoi par sendMemberEmail
// (src/lib/members/emails.ts), avec un faux objet payload : rien ne part, le journal est espionné.
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { resetEmail, sendMemberEmail } from '@/lib/members/emails'

// adresse du site, lue au chargement de src/lib/site.ts : vi.hoisted s'exécute avant les imports ci-dessus (la barre
// finale doit être retirée par le site)
vi.hoisted(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.swatter-tv.fr/')
})

const RESET_PAGE = 'https://www.swatter-tv.fr/compte/nouveau-mot-de-passe'
const TOKEN = 'Q1w2E3r4T5y6U7i8O9p0-_aZsXdCfVgBhNjMkLpOiUy'

/** Faux objet payload : envoi espionné (réussi par défaut) et journal espionné. */
function fakePayload(sendEmail: Mock = vi.fn().mockResolvedValue(undefined)) {
  const logger = { error: vi.fn<(message: string) => void>(), info: vi.fn<(message: string) => void>() }
  return { payload: { sendEmail, logger } as unknown as Payload, sendEmail, logger }
}

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('resetEmail : contenu de l’e-mail « nouveau mot de passe »', () => {
  it('objet en français, et lien vers la page « nouveau mot de passe » du site, dans le HTML et le texte', () => {
    const mail = resetEmail('Jeanne', TOKEN)
    const link = `${RESET_PAGE}?token=${TOKEN}`
    expect(mail.subject).toBe('Swatter TV — choisir un nouveau mot de passe')
    expect(mail.html).toContain(`href="${link}"`)
    // bouton, puis adresse à copier (lien et texte affiché)
    expect(mail.html.split(link).length - 1).toBe(3)
    expect(mail.text).toContain(`Choisir un nouveau mot de passe : ${link}`)
  })

  it('adresse du site sans double barre, même réglée avec une barre finale', () => {
    const mail = resetEmail('Jeanne', TOKEN)
    expect(mail.html).not.toContain('fr//compte')
    expect(mail.text).not.toContain('fr//compte')
  })

  it('le jeton est encodé dans le lien', () => {
    const mail = resetEmail('Jeanne', 'a b+c/d=&e"f<g')
    const link = `${RESET_PAGE}?token=a%20b%2Bc%2Fd%3D%26e%22f%3Cg`
    expect(mail.html).toContain(`href="${link}"`)
    expect(mail.text).toContain(link)
    expect(new URL(link).searchParams.get('token')).toBe('a b+c/d=&e"f<g')
  })

  it('salue le membre par son prénom, ou « Bonjour, » sans prénom', () => {
    expect(resetEmail('Jeanne', TOKEN).html).toContain('<p>Bonjour Jeanne,</p>')
    expect(resetEmail('Jeanne', TOKEN).text.startsWith('Bonjour Jeanne,\n\n')).toBe(true)
    expect(resetEmail('', TOKEN).html).toContain('<p>Bonjour,</p>')
    expect(resetEmail('', TOKEN).text.startsWith('Bonjour,\n\n')).toBe(true)
  })

  it('le prénom est échappé dans le HTML (aucune balise ni attribut injecté)', () => {
    const html = resetEmail('<script>alert("x")</script><img src=x onerror=alert(1)>', TOKEN).html
    expect(html).toContain('Bonjour &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;,')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(resetEmail('Ana & Léo', TOKEN).html).toContain('Bonjour Ana &amp; Léo,')
    expect(resetEmail("O'Neil", TOKEN).html).toContain('Bonjour O&#39;Neil,')
    expect(resetEmail('" style="x', TOKEN).html).toContain('Bonjour &quot; style=&quot;x,')
  })

  it('texte brut : sans balise HTML, prénom tel qu’il a été saisi', () => {
    const text = resetEmail('Ana & Léo <3', TOKEN).text
    expect(text).not.toMatch(/<\/?(p|a|br|div)\b/)
    expect(text).toContain('Bonjour Ana & Léo <3,')
    expect(resetEmail("O'Neil", TOKEN).text).toContain("Bonjour O'Neil,")
    expect(resetEmail('<b>Jean</b>', TOKEN).text).toContain('Bonjour <b>Jean</b>,')
  })

  it('texte brut : un prénom qui ressemble à une entité HTML reste tel quel', () => {
    for (const name of ['Zoé &lt;3', 'Tom &amp; Jerry', 'Jo &quot;le roi&quot;', 'Lou &#39;', 'A &gt; B']) {
      expect(resetEmail(name, TOKEN).text, name).toContain(`Bonjour ${name},`)
    }
  })

  it('annonce la durée de validité du lien (une heure) et que faire si l’on n’a rien demandé', () => {
    for (const body of [resetEmail('Jeanne', TOKEN).html, resetEmail('Jeanne', TOKEN).text]) {
      expect(body).toContain('Ce lien est valable une heure.')
      expect(body).toContain('Ignorez cet e-mail : votre mot de passe actuel reste valable.')
      expect(body).toContain('Une demande de nouveau mot de passe a été faite pour votre espace Swatter TV.')
    }
  })

  it('texte brut : paragraphes séparés par une ligne vide', () => {
    expect(resetEmail('Jeanne', TOKEN).text.split('\n\n')).toEqual([
      'Bonjour Jeanne,',
      'Une demande de nouveau mot de passe a été faite pour votre espace Swatter TV.',
      `Choisir un nouveau mot de passe : ${RESET_PAGE}?token=${TOKEN}`,
      'Ce lien est valable une heure. Vous n’êtes pas à l’origine de cette demande ? Ignorez cet e-mail : votre mot de passe actuel reste valable.',
    ])
  })
})

describe('sendMemberEmail : envoi par le SMTP du site', () => {
  const mail = resetEmail('Jeanne', TOKEN)
  const devLink = `${RESET_PAGE}?token=${TOKEN}`

  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('envoie l’e-mail par payload.sendEmail : destinataire, objet, HTML et texte', async () => {
    const { payload, sendEmail, logger } = fakePayload()
    await sendMemberEmail(payload, 'jeanne@exemple.fr', mail)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith({ to: 'jeanne@exemple.fr', subject: mail.subject, html: mail.html, text: mail.text })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('un échec d’envoi est journalisé, sans exception (jamais montré au visiteur)', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.exemple.fr')
    const { payload, logger } = fakePayload(vi.fn().mockRejectedValue(new Error('Connexion SMTP refusée')))
    await expect(sendMemberEmail(payload, 'jeanne@exemple.fr', mail, devLink)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledTimes(1)
    const message = logger.error.mock.calls[0][0]
    expect(message).toContain('[swatter]')
    expect(message).toContain(mail.subject)
    expect(message).toContain('Connexion SMTP refusée')
    // le journal ne contient pas le lien secret
    expect(message).not.toContain(TOKEN)
  })

  it('une erreur qui n’est pas un objet Error, ou levée aussitôt, est aussi journalisée sans exception', async () => {
    const rejected = fakePayload(vi.fn().mockRejectedValue('délai dépassé'))
    await expect(sendMemberEmail(rejected.payload, 'jeanne@exemple.fr', mail)).resolves.toBeUndefined()
    expect(rejected.logger.error.mock.calls[0][0]).toContain('délai dépassé')
    const thrown = fakePayload(
      vi.fn().mockImplementation(() => {
        throw new Error('adaptateur absent')
      }),
    )
    await expect(sendMemberEmail(thrown.payload, 'jeanne@exemple.fr', mail)).resolves.toBeUndefined()
    expect(thrown.logger.error.mock.calls[0][0]).toContain('adaptateur absent')
  })

  it('hors production et sans SMTP : le lien est rappelé dans le journal pour pouvoir tester', async () => {
    const { payload, logger } = fakePayload()
    await sendMemberEmail(payload, 'jeanne@exemple.fr', mail, devLink)
    expect(logger.info).toHaveBeenCalledTimes(1)
    const message = logger.info.mock.calls[0][0]
    expect(message).toContain('[swatter] (développement, pas de SMTP)')
    expect(message).toContain(mail.subject)
    expect(message).toContain(`lien : ${devLink}`)
  })

  it('en production, le lien n’est jamais écrit dans le journal (même sans SMTP)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { payload, logger } = fakePayload()
    await sendMemberEmail(payload, 'jeanne@exemple.fr', mail, devLink)
    expect(logger.info).not.toHaveBeenCalled()
    const failing = fakePayload(vi.fn().mockRejectedValue(new Error('panne')))
    await sendMemberEmail(failing.payload, 'jeanne@exemple.fr', mail, devLink)
    expect(failing.logger.info).not.toHaveBeenCalled()
    expect(JSON.stringify(failing.logger.error.mock.calls)).not.toContain(TOKEN)
  })

  it('avec un serveur SMTP, le lien n’est pas écrit dans le journal', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.exemple.fr')
    const { payload, logger } = fakePayload()
    await sendMemberEmail(payload, 'jeanne@exemple.fr', mail, devLink)
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('sans lien à rappeler, rien n’est ajouté au journal', async () => {
    const { payload, logger } = fakePayload()
    await sendMemberEmail(payload, 'jeanne@exemple.fr', mail)
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})
