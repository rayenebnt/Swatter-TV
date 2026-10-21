// Formulaire « Proposer une info » (src/lib/contact.ts, POST /api/contact) : sujets, nettoyage et longueur des champs,
// caractères de contrôle, lien, consentement et adresse e-mail (même règle que le champ « email » de la collection messages).
import { describe, expect, it } from 'vitest'
import { CONTACT_SUBJECTS, CONTACT_TO, checkContact, isSubject, subjectLabel, subjectMail } from '@/lib/contact'

const valid = {
  subject: 'info',
  name: 'Jeanne Martin',
  email: 'jeanne.martin@exemple.fr',
  phone: '06 12 34 56 78',
  city: 'Annecy',
  link: 'https://exemple.fr/photos',
  message: 'Un éboulement bloque la route du col depuis ce matin.',
  consent: true,
}
const EMAIL_ERROR = 'Indiquez une adresse e-mail valide, pour que la rédaction puisse vous répondre.'

describe('checkContact : message complet', () => {
  it('un message valide est accepté, tel que saisi', () => {
    const { data, errors } = checkContact(valid)
    expect(errors).toEqual({})
    expect(data).toEqual({
      subject: 'info',
      name: 'Jeanne Martin',
      email: 'jeanne.martin@exemple.fr',
      phone: '06 12 34 56 78',
      city: 'Annecy',
      link: 'https://exemple.fr/photos',
      message: 'Un éboulement bloque la route du col depuis ce matin.',
    })
  })

  it('téléphone, commune et lien sont facultatifs', () => {
    const { data, errors } = checkContact({ name: 'Jo', email: 'jo@exemple.fr', message: 'Dix lettres', consent: 'on' })
    expect(errors).toEqual({})
    expect(data).toMatchObject({ phone: '', city: '', link: '' })
  })

  it('formulaire vide : nom, e-mail, message et consentement demandés', () => {
    expect(checkContact({}).errors).toEqual({
      name: 'Indiquez votre nom.',
      email: EMAIL_ERROR,
      message: 'Votre message est trop court (10 caractères au moins).',
      consent: 'Cochez cette case pour envoyer votre message.',
    })
  })

  it('une erreur seulement pour les champs fautifs', () => {
    expect(Object.keys(checkContact({ ...valid, name: 'J' }).errors)).toEqual(['name'])
    expect(Object.keys(checkContact({ ...valid, email: 'jeanne' }).errors)).toEqual(['email'])
    expect(Object.keys(checkContact({ ...valid, consent: false }).errors)).toEqual(['consent'])
  })

  it('les champs inconnus (piège, durée, autres) ne passent pas dans les données', () => {
    const { data } = checkContact({ ...valid, website: 'http://robot.example', elapsed: 5000, handled: true, emailed: true, to: 'autre@exemple.fr' })
    expect(Object.keys(data).sort()).toEqual(['city', 'email', 'link', 'message', 'name', 'phone', 'subject'])
  })

  it('valeurs qui ne sont pas des chaînes : champs vides', () => {
    const raw = { subject: 1, name: 42, email: { a: 1 }, phone: 6, city: ['Annecy'], link: true, message: ['texte assez long'], consent: true }
    const { data, errors } = checkContact(raw)
    expect(data).toEqual({ subject: 'info', name: '', email: '', phone: '', city: '', link: '', message: '' })
    expect(Object.keys(errors).sort()).toEqual(['email', 'message', 'name'])
  })
})

describe('checkContact : sujets', () => {
  it('trois sujets : proposer une info, publicité, autre demande', () => {
    expect(CONTACT_SUBJECTS.map((s) => s.value)).toEqual(['info', 'publicite', 'autre'])
    for (const s of CONTACT_SUBJECTS) {
      expect(isSubject(s.value)).toBe(true)
      expect(checkContact({ ...valid, subject: s.value }).data.subject).toBe(s.value)
    }
  })

  it('un sujet inconnu ou absent devient « info »', () => {
    for (const v of [undefined, null, '', 'spam', 'Publicite', 'publicité', 42, ['autre'], 'toString', '__proto__']) {
      expect(isSubject(v), String(v)).toBe(false)
      expect(checkContact({ ...valid, subject: v }).data.subject, String(v)).toBe('info')
    }
  })

  it('libellés du formulaire et objets des e-mails envoyés à la rédaction', () => {
    expect(subjectLabel('info')).toBe('Proposer une info')
    expect(subjectLabel('publicite')).toBe('Publicité, partenariat')
    expect(subjectLabel('autre')).toBe('Autre demande')
    expect(subjectMail('info')).toBe('Proposition d’info')
    expect(subjectMail('publicite')).toBe('Demande de partenariat')
    expect(subjectMail('autre')).toBe('Message')
  })

  it('destinataire par défaut : contact@swatter-tv.fr', () => {
    expect(CONTACT_TO).toBe('contact@swatter-tv.fr')
  })
})

describe('checkContact : nettoyage et longueur des champs', () => {
  it('nom : 2 caractères au moins, une fois nettoyé', () => {
    expect(checkContact({ ...valid, name: ' Jo ' }).data.name).toBe('Jo')
    expect(checkContact({ ...valid, name: ' Jo ' }).errors.name).toBeUndefined()
    for (const v of ['', 'J', '  J  ', '\u0000J\u0000', '\t\n']) {
      expect(checkContact({ ...valid, name: v }).errors.name, JSON.stringify(v)).toBe('Indiquez votre nom.')
    }
  })

  it('champs d’une ligne : caractères de contrôle et espaces autour retirés', () => {
    const { data } = checkContact({
      ...valid,
      name: 'Jeanne\u0000 Martin\u0007',
      city: '\tAnnecy\n',
      phone: ' 06\u000012\u007f34 ',
      link: ' https://exemple.fr/a\u0000b ',
    })
    expect(data.name).toBe('Jeanne Martin')
    expect(data.city).toBe('Annecy')
    expect(data.phone).toBe('061234')
    expect(data.link).toBe('https://exemple.fr/ab')
  })

  it('longueurs maximales : nom 120, téléphone 40, commune 120, lien 500, message 5000', () => {
    const { data, errors } = checkContact({
      ...valid,
      name: 'N'.repeat(300),
      phone: '0'.repeat(100),
      city: 'C'.repeat(300),
      link: `https://exemple.fr/${'l'.repeat(1000)}`,
      message: 'M'.repeat(9000),
    })
    expect(errors).toEqual({})
    expect(data.name).toHaveLength(120)
    expect(data.phone).toHaveLength(40)
    expect(data.city).toHaveLength(120)
    expect(data.link).toHaveLength(500)
    expect(data.message).toHaveLength(5000)
  })

  it('message : 10 caractères au moins, sans compter les espaces autour', () => {
    expect(checkContact({ ...valid, message: '123456789' }).errors.message).toBe('Votre message est trop court (10 caractères au moins).')
    expect(checkContact({ ...valid, message: '   court   \n\n  ' }).errors.message).toBeDefined()
    expect(checkContact({ ...valid, message: '1234567890' }).errors.message).toBeUndefined()
  })

  it('message : retours à la ligne et tabulations gardés, autres caractères de contrôle retirés', () => {
    const { data } = checkContact({ ...valid, message: '  Ligne 1\r\n\tLigne 2\u0000\u0007\u000b\u000c\u001b\u007f\nFin  ' })
    expect(data.message).toBe('Ligne 1\r\n\tLigne 2\nFin')
  })

  it('message : accents, guillemets et ponctuation gardés', () => {
    const message = 'Fête des Lumières : « magnifique » ce soir à Lyon ! Photos jointes.'
    expect(checkContact({ ...valid, message }).data.message).toBe(message)
  })
})

describe('checkContact : lien vers les photos ou la vidéo', () => {
  it('facultatif ; s’il est donné, il commence par http:// ou https://', () => {
    for (const link of ['', '   ', 'https://exemple.fr/photos', 'http://exemple.fr', 'HTTPS://EXEMPLE.FR/X', 'https://www.youtube.com/watch?v=abc&t=10s']) {
      expect(checkContact({ ...valid, link }).errors.link, link).toBeUndefined()
    }
  })

  it('refuse tout autre lien (javascript:, data:, ftp:, sans protocole, avec espaces…)', () => {
    for (const link of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'ftp://exemple.fr',
      'www.exemple.fr',
      'exemple.fr/photos',
      '//exemple.fr',
      'https://',
      'https:/exemple.fr',
      'https://exemple.fr/a b',
      'mailto:jeanne@exemple.fr',
    ]) {
      expect(checkContact({ ...valid, link }).errors.link, link).toBe('Le lien doit commencer par https://')
    }
  })
})

describe('checkContact : adresse e-mail', () => {
  it('même règle que l’espace membres et que le champ « email » de Payload', () => {
    for (const email of ['jeanne@exemple.fr', 'Jeanne.Martin@Exemple.FR', 'j+info@exemple.co', ' jeanne@exemple.fr ']) {
      expect(checkContact({ ...valid, email }).errors.email, email).toBeUndefined()
    }
    const invalid = ['jeanne', 'jeanne@exemple', 'jeanne@@exemple.fr', 'jeanne..m@exemple.fr', '"j"@exemple.fr', 'jé@exemple.fr', 'a@b.fr, c@d.fr']
    for (const email of [...invalid, 'jeanne@exemple.fr\r\nBcc: x@y.fr']) {
      expect(checkContact({ ...valid, email }).errors.email, JSON.stringify(email)).toBe(EMAIL_ERROR)
    }
  })

  it('l’adresse est gardée telle que saisie (casse comprise), sans espaces ni caractères de contrôle', () => {
    expect(checkContact({ ...valid, email: ' Jeanne.Martin@Exemple.FR\u0000 ' }).data.email).toBe('Jeanne.Martin@Exemple.FR')
  })

  it('une adresse trop longue est refusée, jamais remplacée par une autre adresse (tronquée)', () => {
    // 201 caractères ; coupée à 200, elle deviendrait « …@exemple.fr », une autre adresse valide
    const typed = `${'a'.repeat(189)}@exemple.frx`
    const { data, errors } = checkContact({ ...valid, email: typed })
    expect(errors.email !== undefined || data.email === typed, `adresse retenue : ${data.email.slice(-20)}`).toBe(true)
  })
})

describe('checkContact : consentement', () => {
  it('case cochée : true, « on » ou « true »', () => {
    for (const consent of [true, 'on', 'true']) expect(checkContact({ ...valid, consent }).errors.consent, String(consent)).toBeUndefined()
  })

  it('toute autre valeur : le message n’est pas envoyé', () => {
    for (const consent of [false, 'false', 'off', '', 0, 1, 'oui', 'TRUE', null, undefined, {}]) {
      expect(checkContact({ ...valid, consent }).errors.consent, String(consent)).toBe('Cochez cette case pour envoyer votre message.')
    }
  })
})
