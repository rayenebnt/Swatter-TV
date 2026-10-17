import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

// Image de partage par défaut (Open Graph / X), générée au build. Police par défaut de next/og (les WOFF2 du site
// ne sont pas pris en charge) ; le logo est le SVG vectorisé de public/logo.svg (texte converti en tracés).
export const alt = 'Swatter TV & Info, la chaîne de la Haute-Savoie\u00a0: direct, info, météo, agenda et replay'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const logo = `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), 'public/logo.svg'))).toString('base64')}`

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 72,
          padding: '0 96px',
          backgroundColor: '#071224',
          backgroundImage:
            'radial-gradient(circle at 88% 0%, rgba(217, 170, 69, 0.30) 0%, rgba(217, 170, 69, 0) 46%), radial-gradient(circle at 0% 100%, rgba(26, 54, 100, 0.85) 0%, rgba(7, 18, 36, 0) 55%)',
          color: '#f6f2e8',
        }}
      >
        <img src={logo} width={300} height={312} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', color: '#d9aa45' }}>Swatter TV &amp; Info</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 70, lineHeight: 1.05, letterSpacing: -1 }}>La chaîne de la Haute-Savoie</div>
          <div style={{ display: 'flex', width: 120, height: 6, marginTop: 34, borderRadius: 6, backgroundImage: 'linear-gradient(90deg, #f9e4a4, #e4b64c 45%, #b4822a)' }} />
          <div style={{ display: 'flex', marginTop: 30, fontSize: 30, color: '#c9d2e3' }}>Direct · Info · Météo · Agenda · Replay</div>
        </div>
      </div>
    ),
    size,
  )
}
