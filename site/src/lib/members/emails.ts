// Espace membres : e-mails (confirmation de l'adresse, nouveau mot de passe, compte déjà existant).
import type { Payload } from 'payload'
import { SITE_URL } from '@/lib/site'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

type Mail = { subject: string; html: string; text: string }

function layout(firstName: string, lines: string[], action: { label: string; href: string } | null, footer: string): Omit<Mail, 'subject'> {
  const hello = firstName ? `Bonjour ${esc(firstName)},` : 'Bonjour,'
  const button = action
    ? `<p style="margin:24px 0"><a href="${action.href}" style="background:#e3b23c;color:#1b1b1b;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(action.label)}</a></p>
<p>Si le bouton ne s'ouvre pas, copiez cette adresse dans votre navigateur :<br><a href="${action.href}">${action.href}</a></p>`
    : ''
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1b;max-width:560px">
<p>${hello}</p>
${lines.map((l) => `<p>${l}</p>`).join('\n')}
${button}
<p style="color:#888;font-size:13px">${footer}</p>
</div>`
  const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const text = [hello, ...lines, ...(action ? [`${action.label} : ${action.href}`] : []), footer].map(plain).join('\n\n')
  return { html, text }
}

/** Lien de confirmation de l'adresse (valable 48 h). */
export function verifyEmail(firstName: string, token: string): Mail {
  const href = `${SITE_URL}/compte/verifier?token=${encodeURIComponent(token)}`
  return {
    ...layout(
      firstName,
      ['Bienvenue sur Swatter TV ! Pour activer votre espace (historique de vos vidéos, « Ma liste », votre météo et l’info de votre département), confirmez votre adresse e-mail.'],
      { label: 'Confirmer mon adresse', href },
      'Ce lien est valable 48 heures. Vous n’avez pas créé de compte ? Ignorez simplement cet e-mail : aucun compte ne sera activé.',
    ),
    subject: 'Swatter TV — confirmez votre adresse e-mail',
  }
}

/** Lien pour choisir un nouveau mot de passe (valable 1 h). */
export function resetEmail(firstName: string, token: string): Mail {
  const href = `${SITE_URL}/compte/nouveau-mot-de-passe?token=${encodeURIComponent(token)}`
  return {
    ...layout(
      firstName,
      ['Une demande de nouveau mot de passe a été faite pour votre espace Swatter TV.'],
      { label: 'Choisir un nouveau mot de passe', href },
      'Ce lien est valable une heure. Vous n’êtes pas à l’origine de cette demande ? Ignorez cet e-mail : votre mot de passe actuel reste valable.',
    ),
    subject: 'Swatter TV — choisir un nouveau mot de passe',
  }
}

/** Inscription avec une adresse qui a déjà un compte confirmé : on prévient le titulaire (sans rien révéler au formulaire). */
export function alreadyRegisteredEmail(firstName: string): Mail {
  return {
    ...layout(
      firstName,
      [
        'Quelqu’un (sans doute vous) vient d’essayer de créer un espace Swatter TV avec votre adresse, qui a déjà un compte.',
        'Vous pouvez simplement vous connecter, ou choisir un nouveau mot de passe si vous l’avez oublié.',
      ],
      { label: 'Me connecter', href: `${SITE_URL}/connexion` },
      `Mot de passe oublié ? ${SITE_URL}/mot-de-passe-oublie`,
    ),
    subject: 'Swatter TV — vous avez déjà un compte',
  }
}

/**
 * Envoie un e-mail à un membre. Sans SMTP (poste de développement), Payload l'écrit seulement dans le journal : le lien
 * y est alors rappelé hors production pour pouvoir tester. Un échec d'envoi est journalisé, jamais montré au visiteur.
 */
export async function sendMemberEmail(payload: Payload, to: string, mail: Mail, devLink?: string): Promise<void> {
  try {
    await payload.sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
  } catch (error) {
    payload.logger.error(`[swatter] E-mail « ${mail.subject} » non envoyé : ${error instanceof Error ? error.message : String(error)}`)
  }
  if (devLink && !process.env.SMTP_HOST && process.env.NODE_ENV !== 'production') {
    payload.logger.info(`[swatter] (développement, pas de SMTP) ${mail.subject} — lien : ${devLink}`)
  }
}
