import { Shield } from './Shield'

/** Logo de la page de connexion de l'administration (admin.components.graphics.Logo). */
export function Logo() {
  return (
    <div className="swatter-admin-logo">
      <Shield id="swatter-admin-logo-gold" className="swatter-admin-logo__shield" />
      <div className="swatter-admin-logo__text">
        <strong>Swatter TV Info</strong>
        <span>Administration du site</span>
      </div>
    </div>
  )
}

export default Logo
