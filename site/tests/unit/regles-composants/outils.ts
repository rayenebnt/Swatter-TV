// Outils des tests unitaires « règles du site et utilitaires des composants » : évaluation en mémoire d'une clause
// « where » de Payload (sous-ensemble des opérateurs du site, avec la sémantique SQL de l'adaptateur PostgreSQL) et
// faux objets (fenêtre du navigateur, stockage local) pour tester sans base, sans réseau et sans navigateur.
import type { Where } from 'payload'

export type Doc = Record<string, unknown>

const isNil = (v: unknown): v is null | undefined => v === null || v === undefined

/** Valeur comparable : nombre, date (ISO 8601 ou Date) en millisecondes, sinon la chaîne telle quelle. */
function comparable(v: unknown): number | string | null {
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const t = /^\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v) : Number.NaN
    return Number.isNaN(t) ? v : t
  }
  return null
}

function compare(a: unknown, b: unknown): number | null {
  const x = comparable(a)
  const y = comparable(b)
  if (x === null || y === null || typeof x !== typeof y) return null
  return x < y ? -1 : x > y ? 1 : 0
}

const same = (value: unknown, operand: unknown) => value === operand || compare(value, operand) === 0

/** Un opérateur appliqué à la valeur d'un champ. Comme en SQL, une valeur absente ne vérifie aucune comparaison. */
function check(value: unknown, operator: string, operand: unknown): boolean {
  switch (operator) {
    case 'equals':
      return isNil(operand) ? isNil(value) : !isNil(value) && same(value, operand)
    case 'not_equals':
      // l'adaptateur PostgreSQL de Payload écrit « colonne IS NULL OR colonne <> valeur »
      return isNil(operand) ? !isNil(value) : isNil(value) || !same(value, operand)
    case 'exists': {
      const wanted = operand === true || operand === 'true'
      return wanted ? !isNil(value) : isNil(value)
    }
    case 'in':
      return Array.isArray(operand) && !isNil(value) && operand.some((o) => same(value, o))
    case 'less_than':
    case 'less_than_equal':
    case 'greater_than':
    case 'greater_than_equal': {
      if (isNil(value)) return false
      const c = compare(value, operand)
      if (c === null) return false
      if (operator === 'less_than') return c < 0
      if (operator === 'less_than_equal') return c <= 0
      if (operator === 'greater_than') return c > 0
      return c >= 0
    }
    default:
      throw new Error(`opérateur non pris en charge par l’outil de test : ${operator}`)
  }
}

const fieldValue = (doc: Doc, path: string): unknown =>
  path.split('.').reduce<unknown>((v, key) => (v !== null && typeof v === 'object' ? (v as Doc)[key] : undefined), doc)

/** Le document vérifie-t-il la clause ? (et / ou imbriqués, plusieurs opérateurs par champ = et) */
export function matches(doc: Doc, where: Where | undefined | null): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return (condition as Where[]).every((w) => matches(doc, w))
    if (key === 'or') return (condition as Where[]).some((w) => matches(doc, w))
    const value = fieldValue(doc, key)
    return Object.entries(condition as Record<string, unknown>).every(([operator, operand]) => check(value, operator, operand))
  })
}

/** Tri à la manière de Payload : « champ » croissant, « -champ » décroissant, plusieurs clés possibles. */
export function sortDocs<T extends Doc>(docs: T[], sort?: string | string[]): T[] {
  const keys = Array.isArray(sort) ? sort : sort ? [sort] : []
  return [...docs].sort((a, b) => {
    for (const key of keys) {
      const desc = key.startsWith('-')
      const field = desc ? key.slice(1) : key
      const c = compare(fieldValue(a, field), fieldValue(b, field)) ?? 0
      if (c) return desc ? -c : c
    }
    return 0
  })
}

/** Stockage local en mémoire ; `blocked` simule un stockage refusé (navigation privée stricte) ou plein. */
export class FakeStorage {
  private data = new Map<string, string>()
  blocked: { read: boolean; write: boolean } = { read: false, write: false }

  getItem(key: string): string | null {
    if (this.blocked.read) throw new DOMException('Accès au stockage refusé', 'SecurityError')
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.blocked.write) throw new DOMException('Stockage plein', 'QuotaExceededError')
    this.data.set(key, String(value))
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}

/** Fenêtre minimale : événements (EventTarget de Node) et stockage local, à installer avec vi.stubGlobal('window', …). */
export function fakeWindow(): EventTarget & { localStorage: FakeStorage } {
  return Object.assign(new EventTarget(), { localStorage: new FakeStorage() })
}
