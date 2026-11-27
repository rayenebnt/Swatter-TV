/**
 * Page « Le groupe » d'un site en ligne : les étapes du matériel (caméras…) ajoutées à la suite des logos passent dans
 * une frise à part, « Notre matériel au fil du temps », juste après celle des logos (moveEquipmentSteps,
 * src/lib/frise-materiel.ts). La page est publiée aussitôt ; les frises se modifient ensuite dans l'administration
 * (Pages › Le groupe › Frises chronologiques).
 *
 * Usage : npm run frise-materiel                    montre ce qui sera fait, sans rien modifier
 *         npm run frise-materiel -- --confirmer     le fait
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { EQUIPMENT_PAGE, EQUIPMENT_TIMELINE, moveEquipmentSteps, type StepSummary } from '@/lib/frise-materiel'

const confirm = process.argv.slice(2).includes('--confirmer')
const payload = await getPayload({ config })
const report = await moveEquipmentSteps(payload, { confirm })
const line = (s: StepSummary) => `  - ${[s.date, s.title].filter(Boolean).join(' · ') || '(sans titre)'}`
let code = 0

switch (report.status) {
  case 'no-page':
    console.log(`Page « Le groupe » (/${EQUIPMENT_PAGE}) introuvable. Rien n'a été modifié.`)
    code = 1
    break
  case 'nothing-to-move':
    console.log('Aucune étape de caméra ou de matériel, ni dans la page ni dans son historique : rien à déplacer. Étapes actuelles :')
    report.steps.forEach((s) => console.log(line(s)))
    break
  default:
    if (report.fromVersion) {
      const at = new Date(report.fromVersion).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })
      console.log(`La page n’a plus d’étape de caméra : reprises de son historique (version enregistrée le ${at}).`)
    }
    console.log(`Vers la frise « ${EQUIPMENT_TIMELINE.title} »${report.existing ? ' (existante, à la suite)' : ' (nouvelle, juste après celle des logos)'} :`)
    report.moved.forEach((s) => console.log(line(s)))
    console.log('Frise des logos (inchangée, sauf les caméras qui en sortent) :')
    report.kept.forEach((s) => console.log(line(s)))
    if (report.draft) console.log('\nLa page a des modifications pas encore publiées : elles seront publiées en même temps.')
    if (report.status === 'ready') console.log('\nRien n’a été modifié. Pour le faire : npm run frise-materiel -- --confirmer')
    else console.log(`\nFrises mises à jour et page publiée : le site se met à jour dans la minute (/${EQUIPMENT_PAGE}).`)
}
process.exit(code)
