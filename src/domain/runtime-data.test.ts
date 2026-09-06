import { describe, expect, it } from 'vitest'
import {
  RUNTIME_DATA_SCHEMA_VERSION,
  RuntimeDataContractError,
  parseRuntimeData,
} from './runtime-data'

describe('runtime data envelopes', () => {
  it('accepts Schema v4 envelopes without deeply validating records', () => {
    const payload = {
      schemaVersion: 4,
      pals: [{ deliberately: 'not a PalRecord' }],
      futureField: true,
    }

    expect(parseRuntimeData('pals', payload)).toEqual(payload)
  })

  it('rejects an incompatible schema version with an actionable error', () => {
    expect(() => parseRuntimeData('skills', { schemaVersion: 3, skills: [] }))
      .toThrow(new RuntimeDataContractError(
        'skills',
        `主动技能数据的 Schema 版本不是 ${RUNTIME_DATA_SCHEMA_VERSION}，请先运行 npm run data:build。`,
      ))
  })

  it.each([
    ['pals', { schemaVersion: 4 }],
    ['elements', { schemaVersion: 4, elements: {} }],
    ['skills', { schemaVersion: 4, skills: null }],
    ['items', { schemaVersion: 4, items: 'items' }],
    ['workSuitabilities', { schemaVersion: 4, workSuitabilities: {} }],
    ['breedingIndex', { schemaVersion: 4, palIds: [], recipes: [] }],
    ['manifest', { schemaVersion: 4, datasetVersion: 'test' }],
  ] as const)('rejects an incomplete %s envelope', (kind, payload) => {
    expect(() => parseRuntimeData(kind, payload)).toThrow(/结构不完整/)
  })
})
