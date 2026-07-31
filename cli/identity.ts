import { matchesPalIdentityQuery, normalizeSearchTerm } from '../src/domain/search'
import type { PalRecord } from '../src/domain/types'

export interface IdentityResolution {
  ok: boolean
  pal?: PalRecord
  reason?: 'no-match' | 'ambiguous'
  candidates: PalRecord[]
}

function normalizeNumber(value: string): string {
  return value.replace(/^0+(?=\d)/, '').toLocaleLowerCase('zh-CN')
}

export function resolvePalIdentity(
  pals: PalRecord[],
  raw: string,
): IdentityResolution {
  const query = normalizeSearchTerm(raw)
  if (!query) {
    return { ok: false, reason: 'no-match', candidates: [] }
  }

  const exact = pals.find((pal) => {
    const identities = [
      pal.internalId,
      pal.paldbId,
      pal.name.zhHans,
      pal.name.en,
      pal.paldexNo ?? '',
    ].map(normalizeSearchTerm)
    if (identities.some((value) => value === query)) {
      return true
    }
    return (
      /^\d+$/.test(query) &&
      pal.paldexNo !== null &&
      normalizeNumber(pal.paldexNo) === normalizeNumber(query)
    )
  })
  if (exact) {
    return { ok: true, pal: exact, candidates: [] }
  }

  const candidates = pals.filter((pal) => matchesPalIdentityQuery(pal, query))
  if (candidates.length === 1) {
    return { ok: true, pal: candidates[0], candidates: [] }
  }
  return {
    ok: false,
    reason: candidates.length > 1 ? 'ambiguous' : 'no-match',
    candidates,
  }
}
