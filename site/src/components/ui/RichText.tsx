import { RichText as LexicalRichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import type { ComponentProps } from 'react'

type Data = ComponentProps<typeof LexicalRichText>['data']

/** Le titre de la page est son seul h1 : un « Titre 1 » saisi dans le contenu est rendu en h2. */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  heading: ({ node, nodesToJSX }) => {
    const Tag = /^h[2-6]$/.test(node.tag) ? node.tag : 'h2'
    return <Tag>{nodesToJSX({ nodes: node.children })}</Tag>
  },
})

/** Contenu riche (éditeur Lexical de Payload), mis en forme par la classe `.prose` de globals.css. */
export function RichText({ data, className }: { data: Data | null | undefined; className?: string }) {
  if (!data || !data.root?.children?.length) return null
  return <LexicalRichText data={data} converters={converters} className={['prose', className].filter(Boolean).join(' ')} />
}
