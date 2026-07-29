import { pinyin } from 'pinyin-pro'
import type { PalRecord } from './types'

const pinyinAliasCache = new Map<string, string>()

export function normalizeSearchTerm(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function pinyinAliasesForName(name: string): string {
  const cached = pinyinAliasCache.get(name)
  if (cached !== undefined) {
    return cached
  }

  const syllables = pinyin(name, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
  const aliases = [
    syllables.join(' '),
    syllables.join(''),
    syllables.map((syllable) => syllable[0] ?? '').join(''),
  ].join(' ')
  pinyinAliasCache.set(name, aliases)
  return aliases
}

export function palIdentitySearchText(
  pal: Pick<PalRecord, 'internalId' | 'paldbId' | 'paldexNo' | 'name'>,
): string {
  return [
    pal.name.zhHans,
    pal.name.en,
    pal.internalId,
    pal.paldbId,
    pal.paldexNo ?? '',
    pinyinAliasesForName(pal.name.zhHans),
  ]
    .map(normalizeSearchTerm)
    .join(' ')
}

export function matchesPalIdentityQuery(
  pal: Pick<PalRecord, 'internalId' | 'paldbId' | 'paldexNo' | 'name'>,
  rawQuery: string,
): boolean {
  const query = normalizeSearchTerm(rawQuery)
  if (!query) {
    return true
  }
  if (/^\d+$/.test(query)) {
    return matchesPaldexNumber(pal.paldexNo, query)
  }
  return palIdentitySearchText(pal).includes(query)
}

export function matchesPaldexNumber(
  paldexNumber: string | null,
  rawQuery: string,
): boolean {
  const query = normalizeSearchTerm(rawQuery)

  if (!query) {
    return true
  }

  if (!paldexNumber) {
    return false
  }

  const normalizedNumber = paldexNumber.toLocaleLowerCase('zh-CN')
  const withoutLeadingZeroes = (value: string) => value.replace(/^0+(?=\d)/, '')

  return (
    normalizedNumber.startsWith(query) ||
    withoutLeadingZeroes(normalizedNumber).startsWith(withoutLeadingZeroes(query))
  )
}
