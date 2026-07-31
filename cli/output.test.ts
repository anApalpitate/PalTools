import { describe, expect, it } from 'vitest'
import {
  formatJson,
  formatPalTable,
  formatPlanIssues,
  formatRecipeTable,
  palRef,
} from './output'
import { makePal, makeTestManifest } from './test-helpers'

describe('cli output', () => {
  it('formats stable json', () => {
    expect(formatJson({ ok: true })).toBe('{\n  "ok": true\n}\n')
  })

  it('builds pal refs', () => {
    const pal = makePal({
      internalId: 'SheepBall',
      paldexNo: '1',
      zhName: '棉悠悠',
      enName: 'Lamball',
    })
    expect(palRef(pal)).toMatchObject({
      internalId: 'SheepBall',
      paldexNo: '1',
      zhName: '棉悠悠',
    })
  })

  it('formats pal table with headers', () => {
    const pal = makePal({ internalId: 'SheepBall', zhName: '棉悠悠' })
    const table = formatPalTable([pal], new Map([['neutral', '无属性']]))
    expect(table).toContain('中文名')
    expect(table).toContain('棉悠悠')
    expect(table).toContain('无属性')
  })

  it('formats recipe table', () => {
    const pals = [
      makePal({ internalId: 'A', zhName: '甲' }),
      makePal({ internalId: 'B', zhName: '乙' }),
      makePal({ internalId: 'C', zhName: '丙' }),
    ]
    const palsById = new Map(pals.map((pal) => [pal.internalId, pal]))
    const table = formatRecipeTable(
      [{ parentAId: 'A', parentBId: 'B', childId: 'C' }],
      palsById,
    )
    expect(table).toContain('亲本A')
    expect(table).toContain('甲')
    expect(table).toContain('丙')
  })

  it('formats plan validation output', () => {
    expect(
      formatPlanIssues({
        valid: true,
        issues: [],
        plan: null,
      }),
    ).toContain('方案有效')
    expect(
      formatPlanIssues({
        valid: false,
        issues: [{ code: 'cycle', message: '存在循环' }],
        plan: null,
      }),
    ).toContain('cycle')
  })

  it('keeps manifest shape usable', () => {
    expect(makeTestManifest().datasetVersion).toBe('test.1')
  })
})
