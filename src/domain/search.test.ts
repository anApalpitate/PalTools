import { describe, expect, it } from 'vitest'
import { matchesPaldexNumber, normalizeSearchTerm } from './search'

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
})
