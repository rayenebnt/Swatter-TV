// Espace membres : validation commune au navigateur et au serveur (src/lib/members/shared.ts) — adresse e-mail (même règle
// que le champ « email » de Payload), prénom, mot de passe, formulaires d'inscription et de profil, département, contenus.
import { email as payloadEmail } from 'payload/shared'
import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '@/lib/departments'
import {
  FAVORITE_KINDS,
  HINT_COOKIE,
  HISTORY_KINDS,
  KIND_LABELS,
  MAX_PASSWORD,
  MIN_PASSWORD,
  SESSION_COOKIE,
  SESSION_DAYS,
  checkEmail,
  checkFirstName,
  checkPassword,
  checkProfile,
  checkSignup,
  isDepartmentValue,
  isEmailAddress,
  isFavoriteKind,
  isHistoryKind,
  normalizeEmail,
} from '@/lib/members/shared'

/** Validateur du champ « email » de Payload (node_modules/payload/dist/fields/validations.js), obligatoire comme `members.email`. */
function payloadAccepts(value: string): boolean {
  const validate = payloadEmail as unknown as (v: string, options: object) => true | string
  return validate(value, { req: { payload: { collections: {}, config: { collections: [] } }, t: (key: string) => key }, required: true }) === true
}

/** Adresse valide de `length` caractères exactement. */
const addressOfLength = (length: number) => `${'a'.repeat(length - '@exemple.fr'.length)}@exemple.fr`

const VALID_ADDRESSES = [
  'jean.dupont@exemple.fr',
  'Jean.Dupont@Exemple.FR',
  'jean+lettre@exemple.fr',
  "o'brien@exemple.ie",
  'a@b.co',
  'j@e.fr',
  '_@exemple.fr',
  '1234@exemple.fr',
  'a.b.c@exemple.fr',
  'prenom-nom@sous.domaine.exemple.fr',
  'jean@ex--emple.fr',
  'jean@xn--exmple-cva.fr',
  'contact@exemple.travel',
  "!#$%&'*+/=?^`{|}~-@exemple.fr",
  addressOfLength(254),
]

const INVALID_ADDRESSES = [
  '',
  'jean',
  'jean@',
  '@exemple.fr',
  'jean@exemple',
  'jean@exemple.f',
  'jean@exemple.123',
  'jean@@exemple.fr',
  'jean @exemple.fr',
  'jean@ exemple.fr',
  'jean dupont@exemple.fr',
  'jean..dupont@exemple.fr',
  '.jean@exemple.fr',
  'jean.@exemple.fr',
  'jean@-exemple.fr',
  'jean@exemple-.fr',
  'jean@exemple..fr',
  'jean@.exemple.fr',
  'jean@exemple.fr.',
  '"jean"@exemple.fr',
  'jean@"exemple.fr"',
  'jean@[127.0.0.1]',
  'jean@127.0.0.1',
  'jéan@exemple.fr',
  'jean@exémple.fr',
  'jean@ex_emple.fr',
  'jean(commentaire)@exemple.fr',
  'jean,dupont@exemple.fr',
  'jean;dupont@exemple.fr',
  'jean<dupont>@exemple.fr',
  'jean\\dupont@exemple.fr',
  'jean@exemple.fr\n',
  '\njean@exemple.fr',
  ' jean@exemple.fr',
  'jean@exemple.fr ',
  'jean@exemple.fr,paul@exemple.fr',
  'jean@exemple.fr\r\nBcc: paul@exemple.fr',
]

describe('normalizeEmail : adresse saisie', () => {
  it('met l’adresse en minuscules et retire les espaces autour', () => {
    expect(normalizeEmail('  Jean.Dupont@Exemple.FR  ')).toBe('jean.dupont@exemple.fr')
    expect(normalizeEmail('\u00a0jean@exemple.fr\u00a0')).toBe('jean@exemple.fr')
  })

  it('retire les caractères de contrôle, dont le caractère nul refusé par PostgreSQL', () => {
    expect(normalizeEmail('je\u0000an@exe\u0007mple.fr\u007f')).toBe('jean@exemple.fr')
    expect(normalizeEmail('\tjean@exemple.fr\r\n')).toBe('jean@exemple.fr')
    expect(normalizeEmail('\u001fjean@exemple.fr\u001b')).toBe('jean@exemple.fr')
  })

  it('renvoie une chaîne vide pour une valeur qui n’est pas une chaîne', () => {
    for (const v of [undefined, null, 42, true, {}, ['jean@exemple.fr'], new String('jean@exemple.fr')]) expect(normalizeEmail(v)).toBe('')
  })

  it('tronque à 255 caractères : une adresse trop longue reste refusée, jamais raccourcie en une adresse valide', () => {
    expect(normalizeEmail('a'.repeat(400))).toHaveLength(255)
    // 254 caractères valides suivis d'autres : l'adresse coupée garde 255 caractères, donc reste refusée
    expect(checkEmail(`${addressOfLength(254)}x`)).toBeDefined()
    expect(checkEmail(`${addressOfLength(254)}${'x'.repeat(100)}`)).toBeDefined()
    expect(checkEmail(`${'a'.repeat(300)}@exemple.fr`)).toBeDefined()
  })
})

describe('isEmailAddress : règle du champ « email » de Payload', () => {
  it('accepte les adresses courantes', () => {
    for (const a of VALID_ADDRESSES) expect(isEmailAddress(a), a).toBe(true)
  })

  it('refuse les adresses mal formées (espaces, points doublés, guillemets, IP, accents, plusieurs adresses…)', () => {
    for (const a of INVALID_ADDRESSES) expect(isEmailAddress(a), JSON.stringify(a)).toBe(false)
  })

  it('accepte et refuse exactement comme le validateur de Payload (adresses de 254 caractères au plus)', () => {
    const battery = [...VALID_ADDRESSES, ...INVALID_ADDRESSES, ...VALID_ADDRESSES.map((a) => a.toUpperCase()), addressOfLength(253), 'a@b.c', 'x@y.zz']
    for (const a of battery) expect(isEmailAddress(a), JSON.stringify(a)).toBe(payloadAccepts(a))
  })

  it('n’accepte jamais une adresse que Payload refuserait à l’enregistrement', () => {
    const candidates = [...VALID_ADDRESSES, ...INVALID_ADDRESSES, addressOfLength(255), addressOfLength(400), 'a@b.co\u0000']
    expect(candidates.filter((a) => isEmailAddress(a) && !payloadAccepts(a))).toEqual([])
  })

  it('254 caractères au plus (plus strict que Payload, qui n’a pas de limite)', () => {
    expect(isEmailAddress(addressOfLength(254))).toBe(true)
    expect(isEmailAddress(addressOfLength(255))).toBe(false)
    expect(payloadAccepts(addressOfLength(255))).toBe(true)
  })

  it('répond aussitôt, même pour une saisie très longue ou piégée (pas de retour arrière exponentiel)', () => {
    const traps = [
      'a'.repeat(1_000_000),
      `a@${'a-'.repeat(126)}!`,
      `a@${'a.'.repeat(125)}a1`,
      `${'a'.repeat(240)}@a`,
      `${'!'.repeat(252)}@`,
      `${'a.'.repeat(126)}@`,
    ]
    const start = performance.now()
    for (const t of traps) expect(isEmailAddress(t)).toBe(false)
    expect(performance.now() - start).toBeLessThan(250)
  })
})

describe('checkEmail', () => {
  it('nettoie l’adresse avant de la vérifier', () => {
    expect(checkEmail('  Jean.Dupont@Exemple.FR ')).toBeUndefined()
    expect(checkEmail('jean@exemple.fr\u0000')).toBeUndefined()
  })

  it('message d’erreur en français pour une adresse invalide, vide ou absente', () => {
    for (const v of ['jean', '', '   ', undefined, null, 42, 'jean@exemple']) expect(checkEmail(v)).toBe('Indiquez une adresse e-mail valide.')
  })
})

describe('checkFirstName : prénom', () => {
  it('2 caractères au moins, une fois nettoyé', () => {
    expect(checkFirstName('Al')).toBeUndefined()
    expect(checkFirstName('Zoé')).toBeUndefined()
    expect(checkFirstName('Jean-Pierre')).toBeUndefined()
    for (const v of ['', 'A', '  A  ', '\u00a0A\u00a0', '      ', '\u0000A\u0000', '\tA\n']) {
      expect(checkFirstName(v), JSON.stringify(v)).toBe('Indiquez votre prénom.')
    }
  })

  it('les caractères de contrôle ne comptent pas', () => {
    expect(checkFirstName('A\u0000l')).toBeUndefined()
    expect(checkFirstName('\u0000\u0001')).toBe('Indiquez votre prénom.')
  })

  it('refuse une valeur qui n’est pas une chaîne', () => {
    for (const v of [undefined, null, 42, true, {}, ['Jean']]) expect(checkFirstName(v)).toBe('Indiquez votre prénom.')
  })

  it('un prénom très long n’est pas une erreur (il est tronqué à 60 caractères)', () => {
    expect(checkFirstName('A'.repeat(500))).toBeUndefined()
    expect(checkSignup({ firstName: 'A'.repeat(500) }).data.firstName).toHaveLength(60)
  })
})

describe('checkPassword : mot de passe', () => {
  it('8 caractères au moins, 200 au plus', () => {
    expect(MIN_PASSWORD).toBe(8)
    expect(MAX_PASSWORD).toBe(200)
    expect(checkPassword('a'.repeat(7))).toBe('Le mot de passe doit contenir au moins 8 caractères.')
    expect(checkPassword('a'.repeat(8))).toBeUndefined()
    expect(checkPassword('a'.repeat(200))).toBeUndefined()
    expect(checkPassword('a'.repeat(201))).toBe('Ce mot de passe est trop long.')
  })

  it('refuse un mot de passe vide ou qui n’est pas une chaîne', () => {
    for (const v of ['', undefined, null, 12345678, true, ['motdepasse'], {}]) {
      expect(checkPassword(v)).toBe('Le mot de passe doit contenir au moins 8 caractères.')
    }
  })

  it('refuse une espace au début ou à la fin (espace, tabulation, espace insécable, retour à la ligne)', () => {
    for (const v of [' motdepasse', 'motdepasse ', '\tmotdepasse', 'motdepasse\n', '\u00a0motdepasse', 'motdepasse\u00a0']) {
      expect(checkPassword(v), JSON.stringify(v)).toBe('Le mot de passe ne doit pas commencer ni finir par une espace.')
    }
  })

  it('accepte les espaces à l’intérieur, les accents et les symboles', () => {
    for (const v of ['mot de passe sûr', 'Été-à-Évian-2026', 'p@$$w0rd!#%', 'ｐａｓｓｗｏｒｄ１２３']) {
      expect(checkPassword(v), v).toBeUndefined()
    }
  })
})

describe('checkSignup : inscription', () => {
  const valid = { firstName: '  Jeanne ', email: ' Jeanne.Martin@Exemple.FR ', password: 'Mot De Passe 2026' }

  it('un formulaire complet est accepté, nettoyé (prénom, e-mail) et le mot de passe gardé tel quel', () => {
    const { data, errors } = checkSignup(valid)
    expect(errors).toEqual({})
    expect(data).toEqual({ firstName: 'Jeanne', email: 'jeanne.martin@exemple.fr', password: 'Mot De Passe 2026' })
  })

  it('une erreur en français par champ invalide', () => {
    expect(checkSignup({ firstName: 'J', email: 'jeanne', password: 'court' }).errors).toEqual({
      firstName: 'Indiquez votre prénom.',
      email: 'Indiquez une adresse e-mail valide.',
      password: 'Le mot de passe doit contenir au moins 8 caractères.',
    })
    expect(Object.keys(checkSignup({ ...valid, email: 'x' }).errors)).toEqual(['email'])
    expect(Object.keys(checkSignup({ ...valid, password: ' Mot De Passe 2026' }).errors)).toEqual(['password'])
  })

  it('un formulaire vide ou fait de valeurs qui ne sont pas des chaînes donne les trois erreurs', () => {
    for (const raw of [{}, { firstName: 42, email: ['a@b.fr'], password: 12345678 }, { firstName: null, email: null, password: null }]) {
      const { data, errors } = checkSignup(raw)
      expect(Object.keys(errors).sort()).toEqual(['email', 'firstName', 'password'])
      expect(data).toEqual({ firstName: '', email: '', password: '' })
    }
  })

  it('ignore tout autre champ envoyé (rôle, département, accord e-mail, suspension…)', () => {
    const { data } = checkSignup({ ...valid, role: 'admin', department: 'isere', newsletter: true, blocked: false, sessionVersion: 0, consentAt: '2020-01-01' })
    expect(Object.keys(data).sort()).toEqual(['email', 'firstName', 'password'])
  })

  it('retire les caractères de contrôle du prénom et tronque à 60 caractères', () => {
    expect(checkSignup({ ...valid, firstName: 'Jea\u0000nne\u007f' }).data.firstName).toBe('Jeanne')
    expect(checkSignup({ ...valid, firstName: `${'é'.repeat(70)}` }).data.firstName).toBe('é'.repeat(60))
  })
})

describe('checkProfile : modification du profil', () => {
  it('un envoi vide ne change rien', () => {
    expect(checkProfile({})).toEqual({ data: {}, errors: {} })
  })

  it('seuls les champs envoyés sont vérifiés et renvoyés', () => {
    expect(checkProfile({ lastName: ' Martin ' })).toEqual({ data: { lastName: 'Martin' }, errors: {} })
    expect(checkProfile({ newsletter: true })).toEqual({ data: { newsletter: true }, errors: {} })
  })

  it('prénom : nettoyé, ou refusé s’il est trop court (il n’est alors pas modifié)', () => {
    expect(checkProfile({ firstName: '  Zoé\u0000 ' })).toEqual({ data: { firstName: 'Zoé' }, errors: {} })
    expect(checkProfile({ firstName: 'Z' })).toEqual({ data: {}, errors: { firstName: 'Indiquez votre prénom.' } })
    expect(checkProfile({ firstName: 'A'.repeat(100) }).data.firstName).toHaveLength(60)
  })

  it('nom : facultatif (peut être effacé), nettoyé et tronqué à 80 caractères', () => {
    expect(checkProfile({ lastName: '' }).data).toEqual({ lastName: '' })
    expect(checkProfile({ lastName: 42 }).data).toEqual({ lastName: '' })
    expect(checkProfile({ lastName: '\tDupont\n' }).data).toEqual({ lastName: 'Dupont' })
    expect(checkProfile({ lastName: 'B'.repeat(200) }).data.lastName).toHaveLength(80)
  })

  it('département : un des 12 départements, ou aucun (null ou vide)', () => {
    for (const d of DEPARTMENTS) expect(checkProfile({ department: d.value })).toEqual({ data: { department: d.value }, errors: {} })
    expect(checkProfile({ department: null })).toEqual({ data: { department: null }, errors: {} })
    expect(checkProfile({ department: '' })).toEqual({ data: { department: null }, errors: {} })
  })

  it('département : toute autre valeur est refusée (libellé, code, « plus » des webcams, autre région…)', () => {
    for (const v of ['paris', 'Isère', 'ISERE', ' isere', '74', 74, 'plus', 'region', true, {}, ['ain'], undefined]) {
      expect(checkProfile({ department: v }), JSON.stringify(v)).toEqual({ data: {}, errors: { department: 'Choisissez un département de la liste.' } })
    }
  })

  it('cases à cocher (e-mails, historique en pause) : seuls true, « on » et « true » valent oui', () => {
    for (const v of [true, 'on', 'true']) expect(checkProfile({ newsletter: v, historyPaused: v }).data).toEqual({ newsletter: true, historyPaused: true })
    for (const v of [false, 'false', 'off', '', 0, 1, 'oui', 'TRUE', null, undefined]) {
      expect(checkProfile({ newsletter: v, historyPaused: v }).data, JSON.stringify(v)).toEqual({ newsletter: false, historyPaused: false })
    }
  })

  it('ignore les champs que le membre ne peut pas modifier lui-même (e-mail, suspension, sessions, empreintes…)', () => {
    const raw = {
      id: 1,
      email: 'autre@exemple.fr',
      createdAt: '2020-01-01T00:00:00.000Z',
      blocked: false,
      sessionVersion: 0,
      passwordHash: 'scrypt$1$1$1$a$b',
      resetTokenHash: 'x',
      resetTokenExpires: '2999-01-01',
      loginAttempts: 0,
      lockUntil: null,
      consentAt: null,
      lastLoginAt: null,
      internalNote: 'note',
      role: 'admin',
    }
    expect(checkProfile(raw)).toEqual({ data: {}, errors: {} })
  })

  it('plusieurs erreurs à la fois', () => {
    expect(checkProfile({ firstName: '', department: 'paris', lastName: 'Martin' })).toEqual({
      data: { lastName: 'Martin' },
      errors: { firstName: 'Indiquez votre prénom.', department: 'Choisissez un département de la liste.' },
    })
  })
})

describe('isDepartmentValue', () => {
  it('vrai pour les 12 départements de la région, faux pour le reste', () => {
    for (const d of DEPARTMENTS) expect(isDepartmentValue(d.value)).toBe(true)
    for (const v of ['Haute-Savoie', '74', 74, 'plus', 'region', '', 'HAUTE-SAVOIE', null, undefined, {}, ['ain']]) {
      expect(isDepartmentValue(v), JSON.stringify(v)).toBe(false)
    }
  })
})

describe('contenus de l’historique et de « Ma liste »', () => {
  it('historique : vidéos et replays seulement', () => {
    expect([...HISTORY_KINDS]).toEqual(['video', 'replay'])
    for (const k of HISTORY_KINDS) expect(isHistoryKind(k)).toBe(true)
    for (const v of ['article', 'event', 'Video', '', null, undefined, 1, 'toString', '__proto__', 'constructor']) {
      expect(isHistoryKind(v), String(v)).toBe(false)
    }
  })

  it('« Ma liste » : vidéos, replays, infos et événements, avec leur libellé', () => {
    expect([...FAVORITE_KINDS]).toEqual(['video', 'replay', 'article', 'event'])
    for (const k of FAVORITE_KINDS) expect(isFavoriteKind(k)).toBe(true)
    for (const v of ['page', 'webcam', 'Article', '', null, undefined, 'toString', '__proto__']) expect(isFavoriteKind(v), String(v)).toBe(false)
    expect(KIND_LABELS).toEqual({ video: 'Vidéo', replay: 'Replay', article: 'Info', event: 'Agenda' })
  })
})

describe('constantes de l’espace membres', () => {
  it('cookies sw_membre (session signée) et sw_connecte (témoin), session de 30 jours', () => {
    expect(SESSION_COOKIE).toBe('sw_membre')
    expect(HINT_COOKIE).toBe('sw_connecte')
    expect(SESSION_DAYS).toBe(30)
    // l'API reconnaît une session périmée à la présence d'un cookie « sw_… » : les deux noms doivent commencer ainsi
    for (const name of [SESSION_COOKIE, HINT_COOKIE]) expect(name.startsWith('sw_')).toBe(true)
  })
})
