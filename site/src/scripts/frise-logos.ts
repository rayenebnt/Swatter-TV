/**
 * Frise « Notre logo au fil du temps » sur la page « Le groupe » d'un site déjà en ligne (installLogoTimeline,
 * seed/frise-logos.ts) : les cinq logos successifs de la chaîne, ajoutés à la médiathèque, placés dans l'ordre sur la
 * frise de la page, publiée aussitôt. Le texte de la page ne change pas ; la frise se modifie ensuite dans
 * l'administration (Pages › Le groupe › Frise chronologique : dates, textes, ordre).
 *
 * Usage : npm run frise-logos                              montre ce qui sera fait, sans rien modifier
 *         npm run frise-logos -- --confirmer               le fait
 *         npm run frise-logos -- --confirmer --remplacer   remplace une frise déjà remplie
 */
import config from '@payload-config'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { installLogoTimeline, LOGO_PAGE, LOGO_TIMELINE } from './seed/frise-logos'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const confirm = args.includes('--confirmer')
const replace = args.includes('--remplacer')

const payload = await getPayload({ config })
const report = await installLogoTimeline(payload, { root: ROOT, confirm, replace })
let code = 0

switch (report.status) {
  case 'no-page':
    console.log(`Page « Le groupe » (/${LOGO_PAGE}) introuvable : créez-la dans l'administration (Pages), puis relancez. Rien n'a été modifié.`)
    code = 1
    break
  case 'pending-changes':
    console.log(
      'La page « Le groupe » a des modifications qui attendent d’être publiées (elles le seraient en même temps) : publiez-les ou annulez-les dans l’administration, puis relancez. Rien n’a été modifié.',
    )
    code = 1
    break
  case 'already-filled':
    console.log(
      `La frise de la page « Le groupe » a déjà ${report.steps} étape(s) : rien n’a été modifié. Pour la remplacer par les cinq logos : npm run frise-logos -- --confirmer --remplacer`,
    )
    break
  default: {
    console.log(`Frise « ${LOGO_TIMELINE.title} » de la page « Le groupe », de la plus ancienne à la plus récente :`)
    LOGO_TIMELINE.steps.forEach((step, i) => {
      const existing = report.media[i]?.existing
      console.log(`  ${i + 1}. ${step.title} (${step.media} : ${existing ? 'déjà dans la médiathèque' : 'ajouté à la médiathèque'})`)
    })
    if (report.replaced) console.log(`  (remplace les ${report.replaced} étape(s) de la frise actuelle)`)
    if (report.status === 'ready') console.log('\nRien n’a été modifié. Pour le faire : npm run frise-logos -- --confirmer')
    else console.log(`\nFrise posée et page publiée : le site se met à jour dans la minute (/${LOGO_PAGE}).`)
  }
}
process.exit(code)
