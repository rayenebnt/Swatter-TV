// Envoi d'un message du formulaire de contact : enregistrement dans « Messages reçus », puis e-mail à la rédaction.
import type { Payload } from 'payload'
import { CONTACT_TO, subjectLabel, subjectMail, type ContactInput } from './contact'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** Adresse qui reçoit les messages : l'e-mail de contact des réglages, à défaut contact@swatter-tv.fr. */
async function recipient(payload: Payload): Promise<string> {
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const email = settings?.contact?.email?.trim()
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : CONTACT_TO
}

/** Texte et HTML de l'e-mail envoyé à la rédaction (« Répondre » écrit directement à l'expéditeur). */
export function contactEmail(m: ContactInput): { subject: string; text: string; html: string } {
  const rows: [string, string][] = [
    ['Sujet', subjectLabel(m.subject)],
    ['Nom', m.name],
    ['E-mail', m.email],
    ['Téléphone', m.phone],
    ['Commune', m.city],
    ['Lien', m.link],
  ].filter(([, v]) => v) as [string, string][]
  const subject = `${subjectMail(m.subject)} — ${m.name}${m.city ? ` (${m.city})` : ''}`
  const text = `${rows.map(([k, v]) => `${k} : ${v}`).join('\n')}\n\n${m.message}\n\n— Message envoyé depuis le formulaire « Proposer une info » du site Swatter TV.`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1b">
<table style="border-collapse:collapse;margin-bottom:16px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join('')}</table>
<p style="white-space:pre-wrap;margin:0 0 20px">${esc(m.message)}</p>
<p style="color:#888;font-size:13px">Message envoyé depuis le formulaire « Proposer une info » du site Swatter TV. Répondez directement à cet e-mail pour écrire à ${esc(m.name)}.</p>
</div>`
  return { subject, text, html }
}

/**
 * Enregistre le message puis l'envoie par e-mail. Un échec d'envoi (SMTP non configuré ou indisponible) n'empêche pas
 * l'enregistrement : le message reste lisible dans l'administration (« E-mail envoyé » décoché).
 */
export async function sendContact(payload: Payload, m: ContactInput): Promise<{ id: number; emailed: boolean }> {
  const doc = await payload.create({ collection: 'messages', data: { ...m, handled: false, emailed: false }, overrideAccess: true })
  let emailed = false
  try {
    const mail = contactEmail(m)
    await payload.sendEmail({ to: await recipient(payload), replyTo: `${m.name.replace(/[<>"]/g, '')} <${m.email}>`, ...mail })
    // Sans SMTP, Payload écrit seulement l'e-mail dans le journal du serveur : rien n'est vraiment parti
    if (!process.env.SMTP_HOST) return { id: doc.id, emailed }
    emailed = true
    await payload.update({ collection: 'messages', id: doc.id, data: { emailed: true }, overrideAccess: true })
  } catch (error) {
    payload.logger.error(`[swatter] Message de contact ${doc.id} enregistré mais non envoyé par e-mail : ${error instanceof Error ? error.message : String(error)}`)
  }
  return { id: doc.id, emailed }
}
