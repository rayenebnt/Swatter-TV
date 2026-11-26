// Page « Le groupe » : les étapes du matériel (caméras…) ajoutées à la suite des logos, dans la première frise, passent
// dans une frise à part, « Notre matériel au fil du temps », placée juste après (npm run frise-materiel, sur le site en
// ligne). La frise se modifie ensuite dans l'administration (Pages › Le groupe › Frises chronologiques).
import type { Payload } from 'payload'
import type { Page } from '@/payload-types'

/** Adresse de la page qui porte les frises. */
export const EQUIPMENT_PAGE = 'le-groupe'

export const EQUIPMENT_TIMELINE = {
  title: 'Notre matériel au fil du temps',
  intro: 'En un an, Swatter TV Info a connu une évolution de son matériel.',
}

type Timeline = NonNullable<Page['timelines']>[number]
type Step = NonNullable<Timeline['steps']>[number]
export type StepSummary = { date: string | null; title: string }

export type EquipmentReport =
  | { status: 'no-page' }
  | { status: 'nothing-to-move'; steps: StepSummary[] }
  | {
      status: 'ready' | 'done'
      /** étapes du matériel, déplacées dans l'ordre */
      moved: StepSummary[]
      /** étapes laissées dans la première frise (les logos) */
      kept: StepSummary[]
      /** la page a des modifications pas encore publiées (brouillon) : elles sont publiées avec */
      draft: boolean
      /** la frise du matériel existait déjà : les étapes y sont ajoutées à la fin */
      existing: boolean
    }

/** Étape du matériel : sa date, son titre ou son texte parle de caméra ou de matériel (« La caméra reportage »…). */
export const isEquipmentStep = (step: Pick<Step, 'date' | 'title' | 'text'>) =>
  [step.date, step.title, step.text].some((value) => Boolean(value && /cam[ée]ra|mat[ée]riel/i.test(value)))

const summary = (step: Step): StepSummary => ({ date: step.date?.trim() || null, title: step.title?.trim() || '' })

/**
 * Déplace les étapes du matériel de la première frise de « Le groupe » vers la frise du matériel (créée juste après la
 * première, ou complétée si elle existe), dans leur ordre ; les autres étapes ne bougent pas. Travaille sur la dernière
 * version de la page, brouillon compris (le client y a peut-être ajouté ses caméras sans publier), et publie le résultat,
 * comme « Publier les modifications ». `confirm: false` : rien n'est modifié, le compte rendu dit ce qui serait fait.
 */
export async function moveEquipmentSteps(payload: Payload, { confirm }: { confirm: boolean }): Promise<EquipmentReport> {
  const page = (await payload.find({ collection: 'pages', where: { slug: { equals: EQUIPMENT_PAGE } }, draft: true, limit: 1, depth: 0, overrideAccess: true }))
    .docs[0]
  if (!page) return { status: 'no-page' }
  const timelines = page.timelines ?? []
  const steps = timelines[0]?.steps ?? []
  const moved = steps.filter(isEquipmentStep)
  if (!moved.length) return { status: 'nothing-to-move', steps: steps.map(summary) }
  const kept = steps.filter((step) => !isEquipmentStep(step))
  const target = timelines.findIndex((t, i) => i > 0 && t.title?.trim() === EQUIPMENT_TIMELINE.title)
  const report = { moved: moved.map(summary), kept: kept.map(summary), draft: page._status !== 'published', existing: target > 0 }
  if (!confirm) return { status: 'ready', ...report }

  // les étapes déplacées changent de frise : nouvel identifiant de ligne
  const movedRows = moved.map(({ id: _id, ...step }) => step)
  const next: Timeline[] = timelines.map((t, i) => (i === 0 ? { ...t, steps: kept } : i === target ? { ...t, steps: [...(t.steps ?? []), ...movedRows] } : t))
  if (target < 0) next.splice(1, 0, { ...EQUIPMENT_TIMELINE, steps: movedRows })
  // toute la dernière version est publiée (brouillon compris), avec ses frises réorganisées
  const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...latest } = page
  await payload.update({ collection: 'pages', id, data: { ...latest, timelines: next, _status: 'published' }, depth: 0, overrideAccess: true })
  return { status: 'done', ...report }
}
