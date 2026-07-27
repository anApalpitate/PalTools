import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_EXACT_GENERATION,
  parseAppConfig,
  parseOwnedPalIds,
  serializeOwnedPalIds,
} from './config'

describe('local configuration', () => {
  it('uses the default and recovers invalid values', () => {
    expect(parseAppConfig(null).config.pathPlanner.maxExactGeneration).toBe(
      DEFAULT_MAX_EXACT_GENERATION,
    )
    expect(
      parseAppConfig(
        JSON.stringify({
          schemaVersion: 1,
          pathPlanner: { maxExactGeneration: 13 },
        }),
      ),
    ).toMatchObject({
      recovered: true,
      config: { pathPlanner: { maxExactGeneration: 6 } },
    })
  })

  it('keeps only known owned pal species', () => {
    const valid = new Set(['A', 'B'])
    const value = serializeOwnedPalIds(['B', 'A', 'A'])
    expect(parseOwnedPalIds(value, valid)).toEqual(['A', 'B'])
    expect(
      parseOwnedPalIds(
        JSON.stringify({ schemaVersion: 1, palIds: ['A', 'X'] }),
        valid,
      ),
    ).toEqual(['A'])
  })
})
