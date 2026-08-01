import { describe, expect, it } from 'vitest'
import type { BreedingPlanV1 } from './breeding-graph'
import {
  BREEDING_PLAN_FILE_EXTENSION,
  MAX_BREEDING_PLAN_FILE_BYTES,
  breedingPlanFileName,
  parseBreedingPlanImport,
  serializeBreedingPlan,
} from './breeding-plan-portability'
import type { BreedingIndexPayload } from './types'

const timestamp = '2026-08-01T05:00:00.000Z'
const breedingIndex: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['A', 'B', 'C'],
  recipes: [[0, 1, 2]],
  recipesByPair: { '0|1': [0] },
  parentsByChild: { C: [0] },
}

function plan(): BreedingPlanV1 {
  return {
    id: 'original-plan',
    schemaVersion: 1,
    name: '测试/方案',
    nodes: [
      { id: 'a', palId: 'A', position: { x: 0, y: 0 }, source: 'preset' },
      { id: 'b', palId: 'B', position: { x: 100, y: 0 }, source: 'preset' },
      { id: 'c', palId: 'C', position: { x: 50, y: 100 }, source: 'manual-child' },
    ],
    relations: [{
      id: 'r',
      parentANodeId: 'a',
      parentBNodeId: 'b',
      childNodeId: 'c',
      recipeIndex: 0,
    }],
    viewport: { x: 10, y: 20, zoom: 0.8 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function importOptions(overrides: Record<string, unknown> = {}) {
  let id = 0
  return {
    currentDatasetVersion: 'dataset-2',
    existingPlanNames: new Set(['测试/方案']),
    validPalIds: new Set(['A', 'B', 'C']),
    breedingIndex,
    now: () => new Date(timestamp),
    createId: (kind: 'plan' | 'node' | 'relation') => `${kind}-${++id}`,
    ...overrides,
  }
}

describe('breeding plan portability', () => {
  it('exports an envelope and imports an equivalent independent plan', () => {
    const text = serializeBreedingPlan(plan(), 'dataset-1', new Date(timestamp))
    const result = parseBreedingPlanImport(text, importOptions())

    expect(result.datasetVersionMismatch).toBe(true)
    expect(result.sourceDatasetVersion).toBe('dataset-1')
    expect(result.plan.id).not.toBe('original-plan')
    expect(result.plan.name).toBe('测试/方案（2）')
    expect(result.plan.nodes.map((node) => node.id)).not.toContain('a')
    expect(result.plan.nodes.every((node) => node.source === 'import')).toBe(true)
    expect(result.plan.relations[0]).toMatchObject({ recipeIndex: 0 })
    expect(result.plan.relations[0].parentANodeId).not.toBe('a')
    expect(parseBreedingPlanImport(text, importOptions({
      currentDatasetVersion: 'dataset-1',
      existingPlanNames: new Set(),
    })).datasetVersionMismatch).toBe(false)
  })

  it('remaps recipe indexes against the current dataset', () => {
    const text = serializeBreedingPlan(plan(), 'dataset-1', new Date(timestamp))
    const shiftedIndex: BreedingIndexPayload = {
      ...breedingIndex,
      recipes: [[2, 2, 2], [0, 1, 2]],
      recipesByPair: { '0|1': [1], '2|2': [0] },
      parentsByChild: { C: [0, 1] },
    }
    const result = parseBreedingPlanImport(text, importOptions({
      breedingIndex: shiftedIndex,
    }))

    expect(result.plan.relations[0].recipeIndex).toBe(1)
  })

  it('rejects oversized, malformed and non-equivalent files as a whole', () => {
    expect(() => parseBreedingPlanImport('x'.repeat(MAX_BREEDING_PLAN_FILE_BYTES + 1), importOptions()))
      .toThrow('5 MiB')
    expect(() => parseBreedingPlanImport('{broken', importOptions())).toThrow('JSON')

    const payload = JSON.parse(serializeBreedingPlan(plan(), 'dataset-1'))
    payload.plan.nodes[2].palId = 'missing'
    expect(() => parseBreedingPlanImport(JSON.stringify(payload), importOptions()))
      .toThrow('不存在')

    expect(() => parseBreedingPlanImport(
      serializeBreedingPlan(plan(), 'dataset-1'),
      importOptions({ breedingIndex: { ...breedingIndex, recipesByPair: {} } }),
    )).toThrow('不存在配方')
  })

  it('enforces node and relation limits before rebuilding IDs', () => {
    const payload = JSON.parse(serializeBreedingPlan(plan(), 'dataset-1'))
    payload.plan.nodes = Array.from({ length: 1_001 }, (_, index) => ({
      id: `node-${index}`,
      palId: 'A',
      position: { x: index, y: 0 },
      source: 'import',
    }))
    payload.plan.relations = []
    expect(() => parseBreedingPlanImport(JSON.stringify(payload), importOptions()))
      .toThrow('1,000 个节点')

    const relationPayload = JSON.parse(serializeBreedingPlan(plan(), 'dataset-1'))
    relationPayload.plan.relations = Array.from(
      { length: 1_001 },
      (_, index) => ({ ...relationPayload.plan.relations[0], id: `relation-${index}` }),
    )
    expect(() => parseBreedingPlanImport(JSON.stringify(relationPayload), importOptions()))
      .toThrow('1,000 条关系')
  })

  it('creates a safe, stable download filename', () => {
    expect(breedingPlanFileName(' 测试:/方案. ')).toBe(`测试--方案${BREEDING_PLAN_FILE_EXTENSION}`)
  })
})
