'use client'
// Commande unique du site pour arrêter ou relancer les aperçus animés (WCAG 2.2.2 : un mouvement lancé seul qui dure plus
// de 5 s doit pouvoir être arrêté) : cartes, tuiles et lecteur d'une fiche. Ils tournent en continu par défaut (demande
// du client) ; le choix est mémorisé dans le navigateur et appliqué aussitôt à toute la page (motion.ts, pilote des
// aperçus). Placée dans le pied de page, à côté de « Gestion des cookies », dans le même style.
import { setPreviewsStopped, useAutoplayAllowed, usePreviewsStopped } from './motion'

/**
 * Élément de liste du pied de page : bouton « Arrêter les aperçus animés » / « Relancer les aperçus animés ». Le libellé
 * dit ce que fait le bouton (comme le bouton pause du lecteur d'une fiche) ; pas d'aria-pressed, qui l'annoncerait
 * « enfoncé » sous un libellé déjà changé. Rendu après l'hydratation seulement (rien au rendu serveur, ni sans
 * JavaScript, où aucun aperçu ne tourne), et masqué en « réduire les animations » ou en économie de données : aucun
 * aperçu ne tourne alors.
 */
export function PreviewsToggle() {
  const allowed = useAutoplayAllowed()
  const stopped = usePreviewsStopped()
  if (!allowed) return null
  return (
    <li>
      <button type="button" onClick={() => setPreviewsStopped(!stopped)}>
        {stopped ? 'Relancer les aperçus animés' : 'Arrêter les aperçus animés'}
      </button>
    </li>
  )
}
