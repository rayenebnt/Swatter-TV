// Mini-rendu Markdown pour le guide d'utilisation (GUIDE_CLIENT.md) : intertitres, paragraphes, listes imbriquées,
// citations, tableaux, gras, code et liens. Produit des éléments React (aucun HTML injecté).
import type { ReactNode } from 'react'

/** Identifiant d'intertitre à la façon de GitHub (liens du sommaire) : minuscules, ponctuation retirée, espaces → tirets. */
export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

/** Texte brut d'une ligne Markdown (pour les identifiants d'intertitres). */
const plain = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let n = 0
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}-${n++}`
    if (m[1] !== undefined) out.push(<code key={k}>{m[1]}</code>)
    else if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], k)}</strong>)
    else {
      const href = m[4]
      const external = /^https?:\/\//.test(href)
      out.push(
        <a key={k} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {inline(m[3], k)}
        </a>,
      )
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Line = { indent: number; text: string }
const LIST_ITEM = /^(-|\d+\.)\s+(.*)$/

/** Liste (et ses sous-listes) à partir de lignes déjà découpées ; `base` : retrait des puces de ce niveau. */
function renderList(lines: Line[], key: string): ReactNode {
  const base = lines[0].indent
  const first = lines[0].text.match(LIST_ITEM)
  const ordered = Boolean(first && first[1] !== '-')
  const items: { text: string; nested: Line[] }[] = []
  for (const line of lines) {
    const m = line.indent === base ? line.text.match(LIST_ITEM) : null
    if (m) items.push({ text: m[2], nested: [] })
    else if (items.length) {
      const item = items[items.length - 1]
      // ligne plus en retrait : sous-liste, ou suite du texte de la puce
      if (LIST_ITEM.test(line.text) || item.nested.length) item.nested.push(line)
      else item.text += ` ${line.text}`
    }
  }
  const children = items.map((item, i) => (
    <li key={i}>
      {inline(item.text, `${key}-${i}`)}
      {item.nested.length > 0 && renderList(item.nested, `${key}-${i}-sub`)}
    </li>
  ))
  return ordered ? (
    <ol key={key} start={Number(first?.[1].replace('.', '')) || 1}>
      {children}
    </ol>
  ) : (
    <ul key={key}>{children}</ul>
  )
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${i}`
    if (!line.trim()) {
      i++
    } else if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={key} />)
      i++
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length
      const text = line.replace(/^#+\s+/, '')
      const Tag = (['h1', 'h2', 'h3'] as const)[level - 1]
      blocks.push(
        <Tag key={key} id={headingId(plain(text))}>
          {inline(text, key)}
        </Tag>,
      )
      i++
    } else if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(
        <blockquote key={key}>
          <p>{inline(quote.join(' '), key)}</p>
        </blockquote>,
      )
    } else if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const [head, , ...body] = rows
      blocks.push(
        <div key={key} className="sw-doc__table">
          <table>
            <thead>
              <tr>
                {cells(head).map((c, j) => (
                  <th key={j} scope="col">
                    {inline(c, `${key}-h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {cells(row).map((c, j) => (
                    <td key={j}>{inline(c, `${key}-${r}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    } else if (LIST_ITEM.test(line)) {
      const items: Line[] = []
      while (i < lines.length && lines[i].trim() && (LIST_ITEM.test(lines[i].trim()) || /^\s+/.test(lines[i]))) {
        const raw = lines[i++]
        items.push({ indent: raw.length - raw.trimStart().length, text: raw.trim() })
      }
      blocks.push(renderList(items, key))
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\||---+\s*$)/.test(lines[i]) && !LIST_ITEM.test(lines[i])) para.push(lines[i++].trim())
      blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>)
    }
  }
  return <div className="sw-doc">{blocks}</div>
}
