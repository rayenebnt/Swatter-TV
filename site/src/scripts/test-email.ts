/**
 * Vérifie l'envoi des e-mails (SMTP) : connexion au serveur, identifiants, puis envoi d'un e-mail d'essai.
 * Usage : npm run test-email -- adresse@exemple.fr
 * Lit les variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_FROM du fichier .env.
 */
import config from '@payload-config'
import nodemailer from 'nodemailer'
import { getPayload } from 'payload'

const to = process.argv.slice(2).find((a) => a.includes('@'))
const fail = (msg: string): never => {
  console.error(`✘ ${msg}`)
  process.exit(1)
}

if (!process.env.SMTP_HOST) fail('SMTP_HOST est vide dans le fichier .env : renseignez les variables SMTP_* (voir README).')
if (!to) fail('Indiquez l’adresse qui doit recevoir l’essai : npm run test-email -- adresse@exemple.fr')

const port = Number(process.env.SMTP_PORT || 587)
const from = process.env.SMTP_FROM || 'contact@swatter-tv.fr'
console.log(`Serveur : ${process.env.SMTP_HOST}:${port} (${port === 465 ? 'SSL' : 'STARTTLS'}), compte : ${process.env.SMTP_USER || '(aucun)'}, expéditeur : ${from}`)

// 1. connexion et identifiants (message clair selon l'erreur)
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  connectionTimeout: 15_000,
})
try {
  await transport.verify()
  console.log('✔ Connexion au serveur et identifiants acceptés')
} catch (error) {
  const e = error as { code?: string; responseCode?: number; message?: string }
  if (e.code === 'EAUTH' || e.responseCode === 535) fail('Identifiants refusés : vérifiez SMTP_USER et SMTP_PASS (Gmail, Outlook : « mot de passe d’application »).')
  if (e.code === 'ESOCKET' || e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED')
    fail(`Serveur injoignable (${e.code}) : vérifiez SMTP_HOST et SMTP_PORT (587 ou 465), et que l’hébergeur n’en bloque pas la sortie.`)
  fail(`Connexion impossible : ${e.message ?? String(error)}`)
}

// 2. envoi d'essai par Payload (même chemin que les vrais e-mails du site)
const payload = await getPayload({ config })
try {
  await payload.sendEmail({
    to,
    subject: 'Swatter TV — e-mail d’essai',
    text: 'Cet e-mail confirme que le site Swatter TV sait envoyer des e-mails (mot de passe oublié, formulaire « Proposer une info »).',
  })
  console.log(`✔ E-mail d’essai envoyé à ${to} (regardez aussi les indésirables)`)
} catch (error) {
  fail(`Envoi refusé : ${error instanceof Error ? error.message : String(error)} (l’adresse SMTP_FROM est-elle autorisée par ce compte ?)`)
}
process.exit(0)
