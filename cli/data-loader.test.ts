import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DataUnavailableError,
  EXPECTED_DATA_SCHEMA_VERSION,
  loadDataset,
} from './data-loader'

let dataDir = ''

const files = {
  'pals.json': { schemaVersion: 4, pals: [] },
  'breeding-index.json': {
    schemaVersion: 4,
    palIds: [],
    recipes: [],
    recipesByPair: {},
    parentsByChild: {},
  },
  'skills.json': { schemaVersion: 4, skills: [] },
  'items.json': { schemaVersion: 4, items: [] },
  'elements.json': { schemaVersion: 4, elements: [] },
  'manifest.json': {
    schemaVersion: 4,
    datasetVersion: 'test-v1',
    gameReleaseLine: '1.0',
    gameBuildId: '24181527',
    generatedAt: '2026-01-01T00:00:00.000Z',
    breedingPolicy: { genderMode: 'ignored', normalizedSpecialPairs: 0 },
    sources: [],
    recordCounts: {},
  },
} as const

function writeDataset(overrides: Partial<Record<keyof typeof files, unknown>> = {}) {
  for (const [fileName, payload] of Object.entries({ ...files, ...overrides })) {
    writeFileSync(join(dataDir, fileName), JSON.stringify(payload), 'utf8')
  }
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'paltools-data-loader-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('CLI runtime data loading', () => {
  it('loads compatible envelopes through the shared contract', () => {
    writeDataset()

    const dataset = loadDataset(dataDir)

    expect(EXPECTED_DATA_SCHEMA_VERSION).toBe(4)
    expect(dataset.manifest.datasetVersion).toBe('test-v1')
    expect(dataset.breedingIndex.recipes).toEqual([])
  })

  it('preserves DataUnavailableError for incompatible data', () => {
    writeDataset({
      'skills.json': { schemaVersion: 3, skills: [] },
    })

    expect(() => loadDataset(dataDir)).toThrow(DataUnavailableError)
    expect(() => loadDataset(dataDir)).toThrow(
      '主动技能数据的 Schema 版本不是 4，请先运行 npm run data:build。',
    )
  })

  it('reports missing envelope fields as recoverable data errors', () => {
    writeDataset({
      'breeding-index.json': { schemaVersion: 4, palIds: [], recipes: [] },
    })

    expect(() => loadDataset(dataDir)).toThrow(DataUnavailableError)
    expect(() => loadDataset(dataDir)).toThrow(
      '配种索引结构不完整，请先运行 npm run data:build。',
    )
  })
})
