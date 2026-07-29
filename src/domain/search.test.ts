import { describe, expect, it } from 'vitest'
import {
  matchesPalIdentityQuery,
  matchesPaldexNumber,
  normalizeSearchTerm,
  palIdentitySearchText,
} from './search'

describe('normalizeSearchTerm', () => {
  it('trims whitespace and normalizes English case', () => {
    expect(normalizeSearchTerm('  Pal A  ')).toBe('pal a')
  })
})

describe('matchesPaldexNumber', () => {
  it('matches both a base number and its lettered variant by prefix', () => {
    expect(matchesPaldexNumber('079', '79')).toBe(true)
    expect(matchesPaldexNumber('079B', '79')).toBe(true)
  })

  it('matches all records for an empty query', () => {
    expect(matchesPaldexNumber(null, '  ')).toBe(true)
  })

  it('matches a pure numeric prefix against leading zeroes and lettered variants', () => {
    expect(matchesPaldexNumber('025', '25')).toBe(true)
    expect(matchesPaldexNumber('025B', '25')).toBe(true)
  })
})

describe('palIdentitySearchText', () => {
  const pal = {
    internalId: 'SheepBall',
    paldbId: 'Lamball',
    paldexNo: '001',
    name: { zhHans: '棉悠悠', en: 'Lamball' },
  }

  it('adds continuous pinyin and pinyin initials to identity search text', () => {
    const searchable = palIdentitySearchText(pal)

    expect(searchable).toContain('mianyouyou')
    expect(searchable).toContain('myy')
  })

  it('uses paldex prefixes exclusively for pure numeric identity queries', () => {
    expect(matchesPalIdentityQuery({ ...pal, paldexNo: '025' }, '25')).toBe(true)
    expect(matchesPalIdentityQuery({ ...pal, paldexNo: '125' }, '25')).toBe(false)
  })
})
