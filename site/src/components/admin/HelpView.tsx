import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { Markdown } from './markdown'

/**
 * Page « Aide » de l'administration (/admin/aide) : le guide d'utilisation GUIDE_CLIENT.md, toujours à jour avec le site.
 * Le fichier est embarqué dans le build autonome par outputFileTracingIncludes (next.config.ts).
 */
export async function HelpView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const guide = await readFile(path.join(process.cwd(), 'GUIDE_CLIENT.md'), 'utf8').catch(() => null)
  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <SetStepNav nav={[{ label: 'Aide' }]} />
      <Gutter className="sw-help">
        {guide ? (
          <Markdown source={guide} />
        ) : (
          <p>Le guide d’utilisation est introuvable sur le serveur. Votre prestataire technique peut vous le transmettre.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}

export default HelpView
