import { RichText as LexicalRichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import type { ComponentProps } from 'react'
import { MediaImage } from './MediaImage'
import { PROSE_SIZES, proseUpload } from './proseUpload'

type Data = ComponentProps<typeof LexicalRichText>['data']

/**
 * Le titre de la page est son seul h1 : un « Titre 1 » saisi dans le contenu est rendu en h2.
 * Fichier inséré dans le texte : image d'origine (ou sa déclinaison « hero », jamais une découpe 16:9) à ses vraies
 * proportions, en différé et à la largeur de la colonne ; vidéo dans le lecteur du navigateur ; autre fichier en lien.
 */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  heading: ({ node, nodesToJSX }) => {
    const Tag = /^h[2-6]$/.test(node.tag) ? node.tag : 'h2'
    return <Tag>{nodesToJSX({ nodes: node.children })}</Tag>
  },
  upload: ({ node }) => {
    const item = proseUpload(node)
    if (!item) return null
    if (item.kind === 'image') {
      return (
        <figure>
          <MediaImage media={item.media} size="hero" sizes={PROSE_SIZES} alt={item.alt} />
          {item.credit && <figcaption>© {item.credit}</figcaption>}
        </figure>
      )
    }
    if (item.kind === 'video') {
      return (
        <video src={item.src} controls playsInline preload="metadata" aria-label={item.label}>
          <a href={item.src}>Télécharger la vidéo</a>
        </video>
      )
    }
    return (
      <a href={item.src} rel="noopener noreferrer">
        {item.name}
      </a>
    )
  },
})

/** Contenu riche (éditeur Lexical de Payload), mis en forme par la classe `.prose` de globals.css. */
export function RichText({ data, className }: { data: Data | null | undefined; className?: string }) {
  if (!data || !data.root?.children?.length) return null
  return <LexicalRichText data={data} converters={converters} className={['prose', className].filter(Boolean).join(' ')} />
}
