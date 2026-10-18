'use client'

/**
 * Page d'erreur de dernier recours : la mise en page commune elle-même n'a pas pu s'afficher.
 * Elle remplace tout le document (html, body), sans dépendre des styles ni des polices du site.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#071224', color: '#f6f2e8', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
        <main style={{ maxWidth: 560, padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#d9aa45', fontWeight: 700, letterSpacing: '.16em', fontSize: 13, textTransform: 'uppercase' }}>Swatter TV</p>
          <h1 style={{ margin: '14px 0 12px', fontSize: 'clamp(28px, 6vw, 40px)', lineHeight: 1.1 }}>Le site est momentanément indisponible</h1>
          <p style={{ margin: 0, color: '#c9d2e3', lineHeight: 1.6 }}>Un incident technique empêche l’affichage des pages. Réessayez dans quelques instants.</p>
          <p style={{ margin: '28px 0 0', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => retry()} style={{ cursor: 'pointer', border: 0, borderRadius: 999, padding: '14px 26px', fontWeight: 700, fontSize: 15, color: '#1b1305', background: 'linear-gradient(135deg, #f9e4a4 0%, #e4b64c 45%, #b4822a 100%)' }}>
              Réessayer
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- rechargement complet voulu */}
            <a href="/" style={{ borderRadius: 999, padding: '14px 26px', fontWeight: 700, fontSize: 15, color: '#f6f2e8', textDecoration: 'none', border: '1px solid rgba(255,255,255,.15)' }}>
              Retour à l’accueil
            </a>
          </p>
        </main>
      </body>
    </html>
  )
}
