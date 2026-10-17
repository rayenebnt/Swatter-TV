// Recherche : normalisation du texte (sans casse ni accents), partagée par le serveur (lib/search.ts) et le client.

/** Équivalences typographiques : apostrophes courbes et espaces insécables. */
const SPECIAL: Record<string, string> = { '’': "'", '‘': "'", 'ʼ': "'", ' ': ' ', ' ': ' ' }

function foldChar(ch: string): string {
  const special = SPECIAL[ch]
  if (special) return special
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // Un caractère donne toujours un caractère : les positions restent alignées sur le texte d'origine (surlignage)
  return base.length === 1 ? base : ch
}

/** « Météo d’Annecy » → « meteo d'annecy » (minuscules, sans accents, apostrophes droites), de même longueur que l'original. */
export function foldText(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = ch.charCodeAt(0)
    if (code < 128) out += ch.toLowerCase()
    else if (code >= 0xd800 && code <= 0xdfff) out += ch // moitié d'une paire de substitution (emoji…) : inchangée
    else out += foldChar(ch)
  }
  return out
}

/** Longueur maximale d'une requête (le point d'entrée /api/search coupe aussi à 80 caractères). */
export const MAX_QUERY = 80

/** Requête nettoyée pour l'affichage et les adresses : espaces resserrés, longueur bornée. */
export const cleanQuery = (q: string | null | undefined) => (q ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)

/** Découpe en mots : guillemets ignorés, ponctuation de début et de fin retirée (« "Lac d’Annecy !" » → ['Lac', 'd’Annecy']). */
export function splitWords(text: string): string[] {
  return text
    .replace(/["«»“”„‹›]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
}

/** Mots significatifs d'une requête, pliés (sans casse ni accents), sans doublons, six au plus. */
export const queryWords = (q: string): string[] => [...new Set(splitWords(foldText(cleanQuery(q))))].slice(0, 6)

export type TextPart = { text: string; hit: boolean }

/** Découpe `text` en morceaux, ceux qui correspondent à un mot de la requête marqués `hit` (pour <mark>). */
export function highlightParts(text: string, words: string[]): TextPart[] {
  const folded = foldText(text)
  const ranges: [number, number][] = []
  for (const w of words) {
    if (w.length < 2) continue
    for (let i = folded.indexOf(w); i !== -1; i = folded.indexOf(w, i + w.length)) ranges.push([i, i + w.length])
  }
  if (!ranges.length) return [{ text, hit: false }]
  ranges.sort((a, b) => a[0] - b[0])
  const parts: TextPart[] = []
  let pos = 0
  for (const [start, end] of ranges) {
    if (end <= pos) continue
    const from = Math.max(start, pos)
    if (from > pos) parts.push({ text: text.slice(pos, from), hit: false })
    parts.push({ text: text.slice(from, end), hit: true })
    pos = end
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false })
  return parts
}
