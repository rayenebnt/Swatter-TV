import { ImageResponse } from 'next/og'
import { logoSvg } from '@/lib/logo'

// Image de partage par défaut (Open Graph / X), générée au build. Police par défaut de next/og (les WOFF2 du site
// ne sont pas pris en charge) ; le logo est le SVG vectorisé de lib/logo.ts (texte converti en tracés).
export const alt = 'Swatter TV Info, la chaîne d’Auvergne-Rhône-Alpes\u00a0: direct, info, météo, agenda et replay'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg()).toString('base64')}`

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 56,
          padding: '0 72px',
          backgroundColor: '#071224',
          backgroundImage:
            'radial-gradient(circle at 88% 0%, rgba(217, 170, 69, 0.30) 0%, rgba(217, 170, 69, 0) 46%), radial-gradient(circle at 0% 100%, rgba(26, 54, 100, 0.85) 0%, rgba(7, 18, 36, 0) 55%)',
          color: '#f6f2e8',
        }}
      >
        <img src={logo} width={340} height={255} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', color: '#d9aa45' }}>Swatter TV Info</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18, fontSize: 58, lineHeight: 1.1, letterSpacing: -1, whiteSpace: 'nowrap' }}>
            <span>La chaîne de la région</span>
            <span>Auvergne-Rhône-Alpes</span>
          </div>
          <div style={{ display: 'flex', width: 120, height: 6, marginTop: 34, borderRadius: 6, backgroundImage: 'linear-gradient(90deg, #f9e4a4, #e4b64c 45%, #b4822a)' }} />
          <div style={{ display: 'flex', marginTop: 30, fontSize: 30, color: '#c9d2e3' }}>Direct · Info · Météo · Agenda · Replay</div>
        </div>
      </div>
    ),
    size,
  )
}
