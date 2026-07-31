import { describe, expect, it } from 'vitest'
import { makePal } from './test-helpers'
import { resolvePalIdentity } from './identity'

const pals = [
  makePal({
    internalId: 'SheepBall',
    paldbId: 'Lamball',
    paldexNo: '1',
    zhName: '棉悠悠',
    enName: 'Lamball',
  }),
  makePal({
    internalId: 'PinkCat',
    paldbId: 'Cattiva',
    paldexNo: '2',
    zhName: '布丁猫',
    enName: 'PuddingCat',
  }),
  makePal({
    internalId: 'MochiCat',
    paldbId: 'MochiCat',
    paldexNo: '3',
    zhName: '麻薯猫',
    enName: 'MochiCat',
  }),
]

describe('resolvePalIdentity', () => {
  it('resolves exact internal id', () => {
    const result = resolvePalIdentity(pals, 'SheepBall')
    expect(result.ok).toBe(true)
    expect(result.pal?.internalId).toBe('SheepBall')
  })

  it('resolves paldex number ignoring leading zeros', () => {
    const result = resolvePalIdentity(pals, '01')
    expect(result.ok).toBe(true)
    expect(result.pal?.internalId).toBe('SheepBall')
  })

  it('resolves unique pinyin alias', () => {
    const result = resolvePalIdentity(pals, 'mianyou')
    expect(result.ok).toBe(true)
    expect(result.pal?.internalId).toBe('SheepBall')
  })

  it('reports ambiguity', () => {
    const result = resolvePalIdentity(pals, '猫')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('ambiguous')
    expect(result.candidates).toHaveLength(2)
  })

  it('reports no match', () => {
    const result = resolvePalIdentity(pals, '不存在的帕鲁')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no-match')
  })
})
