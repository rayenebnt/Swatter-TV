import { RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
import type { ComponentProps } from 'react'

type Data = ComponentProps<typeof LexicalRichText>['data']

/** Contenu riche (éditeur Lexical de Payload), mis en forme par la classe `.prose` de globals.css. */
export function RichText({ data, className }: { data: Data | null | undefined; className?: string }) {
  if (!data || !data.root?.children?.length) return null
  return <LexicalRichText data={data} className={['prose', className].filter(Boolean).join(' ')} />
}
