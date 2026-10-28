import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGO_GOLD_PATH, LOGO_WHITE_PATH, logoSvg } from '@/lib/logo'

describe('logo', () => {
  it('public/logo.svg est la copie exacte de lib/logo.ts (reflet de l’en-tête, partages)', () => {
    expect(readFileSync(join(process.cwd(), 'public/logo.svg'), 'utf8').trim()).toBe(logoSvg())
  })

  it('les tracés ne contiennent que des commandes absolues M, L, C, Z et des nombres', () => {
    for (const d of [LOGO_GOLD_PATH, LOGO_WHITE_PATH]) expect(d).toMatch(/^M[\d.\sMLCZ-]+$/)
  })
})
