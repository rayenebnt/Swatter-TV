// Construction de contenus riches Lexical (format stocké par Payload) à partir d'un texte simple.
//
// Chaque élément du tableau donne un bloc :
//   « ## Intertitre »        → titre h2   (« ### » → h3)
//   « - élément »            → liste à puces (les lignes « - » consécutives sont regroupées)
//   « > citation »           → citation
//   tout le reste            → paragraphe
// Dans le texte : **gras**, *italique* et [libellé](https://lien).

type LexicalText = {
  type: 'text'
  text: string
  format: number
  style: string
  mode: 'normal'
  detail: number
  version: 1
}

type LexicalLink = {
  type: 'link'
  version: 3
  fields: { url: string; newTab: boolean; linkType: 'custom' }
  children: LexicalText[]
  direction: 'ltr'
  format: ''
  indent: 0
}

type Inline = LexicalText | LexicalLink

type LexicalBlock = {
  type: string
  version: number
  children: (Inline | LexicalBlock)[]
  direction: 'ltr'
  format: ''
  indent: 0
  [k: string]: unknown
}

export type LexicalDoc = {
  root: {
    type: 'root'
    children: LexicalBlock[]
    direction: 'ltr'
    format: ''
    indent: 0
    version: 1
  }
}

const BOLD = 1
const ITALIC = 2

const textNode = (text: string, format = 0): LexicalText => ({
  type: 'text',
  text,
  format,
  style: '',
  mode: 'normal',
  detail: 0,
  version: 1,
})

/** Découpe une ligne en nœuds texte (gras, italique) et liens. */
function inline(source: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g
  let last = 0
  for (const m of source.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push(textNode(source.slice(last, at)))
    if (m[1] !== undefined) out.push(textNode(m[1], BOLD))
    else if (m[2] !== undefined) out.push(textNode(m[2], ITALIC))
    else if (m[3] !== undefined && m[4] !== undefined) {
      const url = m[4]
      out.push({
        type: 'link',
        version: 3,
        fields: { url, newTab: /^https?:\/\//.test(url), linkType: 'custom' },
        children: [textNode(m[3])],
        direction: 'ltr',
        format: '',
        indent: 0,
      })
    }
    last = at + m[0].length
  }
  if (last < source.length) out.push(textNode(source.slice(last)))
  return out
}

const block = (type: string, children: (Inline | LexicalBlock)[], extra: Record<string, unknown> = {}): LexicalBlock => ({
  type,
  version: 1,
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  ...extra,
})

/** Transforme une liste de lignes en document Lexical valide. */
export function lexical(lines: string[]): LexicalDoc {
  const children: LexicalBlock[] = []
  let list: LexicalBlock | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('- ')) {
      if (!list) {
        list = block('list', [], { listType: 'bullet', start: 1, tag: 'ul' })
        children.push(list)
      }
      list.children.push(block('listitem', inline(line.slice(2)), { value: list.children.length + 1 }))
      continue
    }
    list = null
    if (line.startsWith('### ')) children.push(block('heading', inline(line.slice(4)), { tag: 'h3' }))
    else if (line.startsWith('## ')) children.push(block('heading', inline(line.slice(3)), { tag: 'h2' }))
    else if (line.startsWith('> ')) children.push(block('quote', inline(line.slice(2))))
    else children.push(block('paragraph', inline(line), { textFormat: 0, textStyle: '' }))
  }

  return { root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 } }
}
