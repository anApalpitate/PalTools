import { describe, expect, it } from 'vitest'
import {
  breedingPlanExportV1Schema,
  parseLegacyOwnedPalIds,
  planPresetLinkV1Schema,
  validateBreedingPlan,
  type BreedingPlanV1,
} from './breeding-graph'
import type { BreedingIndexPayload } from './types'

const timestamp = '2026-07-30T08:00:00.000Z'

function plan(
  overrides: Partial<BreedingPlanV1> = {},
): BreedingPlanV1 {
  return {
    id: 'plan-1',
    schemaVersion: 1,
    name: '测试方案',
    nodes: [
      {
        id: 'parent-a',
        palId: 'A',
        position: { x: 0, y: 0 },
        source: 'preset',
      },
      {
        id: 'parent-b',
        palId: 'B',
        position: { x: 200, y: 0 },
        source: 'preset',
      },
      {
        id: 'child',
        palId: 'C',
        position: { x: 100, y: 200 },
        source: 'manual-child',
      },
    ],
    relations: [
      {
        id: 'relation-1',
        parentANodeId: 'parent-a',
        parentBNodeId: 'parent-b',
        childNodeId: 'child',
        recipeIndex: 0,
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

const breedingIndex: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['A', 'B', 'C'],
  recipes: [[0, 1, 2]],
  recipesByPair: { 'A|B': [0] },
  parentsByChild: { C: [0] },
}

describe('breeding graph domain', () => {
  it('accepts a valid DAG and verifies its recipe against the static index', () => {
    const result = validateBreedingPlan(plan(), {
      validPalIds: new Set(['A', 'B', 'C']),
      breedingIndex,
    })

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('rejects duplicate nodes, multiple generators and directed cycles', () => {
    const input = plan()
    input.nodes.push({
      ...input.nodes[0],
      position: { x: 300, y: 0 },
    })
    input.relations.push(
      {
        id: 'relation-2',
        parentANodeId: 'parent-a',
        parentBNodeId: 'parent-b',
        childNodeId: 'child',
        recipeIndex: 0,
      },
      {
        id: 'relation-3',
        parentANodeId: 'child',
        parentBNodeId: 'parent-b',
        childNodeId: 'parent-a',
        recipeIndex: 0,
      },
    )

    const codes = validateBreedingPlan(input).issues.map((issue) => issue.code)
    expect(codes).toContain('duplicate-node-id')
    expect(codes).toContain('multiple-generating-relations')
    expect(codes).toContain('cycle')
  })

  it('rejects missing nodes, identical parent nodes and mismatched recipes', () => {
    const input = plan({
      relations: [
        {
          id: 'relation-1',
          parentANodeId: 'parent-a',
          parentBNodeId: 'parent-a',
          childNodeId: 'missing-child',
          recipeIndex: 9,
        },
      ],
    })
    const codes = validateBreedingPlan(input, { breedingIndex }).issues.map(
      (issue) => issue.code,
    )

    expect(codes).toContain('missing-node')
    expect(codes).toContain('same-parent-node')
  })

  it('keeps preset-plan links independent and validates the export envelope', () => {
    expect(
      planPresetLinkV1Schema.parse({
        planId: 'plan-1',
        presetId: 'preset-2',
        lastUsedAt: timestamp,
      }),
    ).toEqual({
      planId: 'plan-1',
      presetId: 'preset-2',
      lastUsedAt: timestamp,
    })

    expect(
      breedingPlanExportV1Schema.safeParse({
        format: 'paltools-breeding-plan',
        schemaVersion: 1,
        datasetVersion: 'dataset-1',
        exportedAt: timestamp,
        plan: {
          name: '导出方案',
          nodes: [],
          relations: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }).success,
    ).toBe(true)
  })

  it('parses, filters and de-duplicates the legacy owned-pal payload', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      palIds: ['B', 'missing', 'A', 'B'],
    })
    expect(parseLegacyOwnedPalIds(raw, new Set(['A', 'B']))).toEqual(['A', 'B'])
    expect(parseLegacyOwnedPalIds('{broken', new Set(['A']))).toEqual([])
  })
})
