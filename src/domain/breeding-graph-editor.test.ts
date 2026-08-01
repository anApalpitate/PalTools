import { describe, expect, it } from 'vitest'
import {
  addChildRelation,
  addPalNode,
  appendRecipeToPlan,
  deletePlanNodes,
  layoutBreedingPlan,
  mergePalNodes,
} from './breeding-graph-editor'
import type { BreedingPlanV1 } from './breeding-graph'
import type { BreedingIndexPayload, PalRecord } from './types'

const timestamp = '2026-08-01T00:00:00.000Z'
const index: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['A', 'B', 'C'],
  recipes: [[0, 1, 2]],
  recipesByPair: { '0|1': [0] },
  parentsByChild: { '2': [0] },
}

function emptyPlan(): BreedingPlanV1 {
  return {
    id: 'plan-1',
    schemaVersion: 1,
    name: '方案',
    nodes: [],
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function pal(id: string, paldexNo: string): PalRecord {
  return {
    internalId: id,
    paldbId: id,
    paldexNo,
    name: { zhHans: id, en: id },
    elements: ['neutral'],
    rarity: 1,
    workSuitabilities: {},
    partnerSkill: null,
    stats: {
      hp: 1,
      attack: 1,
      defense: 1,
      workSpeed: 1,
      walkSpeed: 1,
      runSpeed: 1,
      swimSpeed: 1,
      rideSprintSpeed: 1,
      transportSpeed: 1,
      stamina: 1,
      foodAmount: 1,
    },
    statSources: {},
    activeSkills: [],
    passiveSkills: [],
    drops: [],
    image: { localPath: '', sourceUrl: '', sha256: 'a'.repeat(64) },
    sourceUrl: '',
  }
}

describe('breeding graph editor', () => {
  it('allows duplicate pal node instances and creates a validated child relation', () => {
    let plan = addPalNode(emptyPlan(), 'A', 'preset', 'parent-a')
    plan = addPalNode(plan, 'A', 'preset', 'parent-a-copy')
    plan = addPalNode(plan, 'B', 'preset', 'parent-b')

    expect(plan.nodes.filter((node) => node.palId === 'A')).toHaveLength(2)
    const result = addChildRelation(
      plan,
      'parent-a',
      'parent-b',
      { recipeIndex: 0, parentAId: 'A', parentBId: 'B', childId: 'C' },
      { node: () => 'child', relation: () => 'relation-1' },
      { validPalIds: new Set(['A', 'B', 'C']), breedingIndex: index },
    )

    expect(result.plan.nodes.at(-1)).toMatchObject({
      id: 'child',
      palId: 'C',
      source: 'manual-child',
    })
    expect(result.plan.relations[0]).toMatchObject({
      parentANodeId: 'parent-a',
      parentBNodeId: 'parent-b',
      childNodeId: 'child',
      recipeIndex: 0,
    })
  })

  it('rejects using the same node instance twice', () => {
    const plan = addPalNode(emptyPlan(), 'A', 'preset', 'parent-a')
    expect(() =>
      addChildRelation(
        plan,
        'parent-a',
        'parent-a',
        { recipeIndex: 0, parentAId: 'A', parentBId: 'B', childId: 'C' },
        { node: () => 'child', relation: () => 'relation-1' },
        { validPalIds: new Set(['A', 'B', 'C']), breedingIndex: index },
      ),
    ).toThrow('两个不同')
  })

  it('lays out the same DAG deterministically with parents above children', () => {
    let plan = addPalNode(emptyPlan(), 'B', 'preset', 'parent-b')
    plan = addPalNode(plan, 'A', 'preset', 'parent-a')
    plan = addChildRelation(
      plan,
      'parent-a',
      'parent-b',
      { recipeIndex: 0, parentAId: 'A', parentBId: 'B', childId: 'C' },
      { node: () => 'child', relation: () => 'relation-1' },
      { validPalIds: new Set(['A', 'B', 'C']), breedingIndex: index },
    ).plan
    const pals = new Map([
      ['A', pal('A', '001')],
      ['B', pal('B', '002')],
      ['C', pal('C', '003')],
    ])

    const first = layoutBreedingPlan(plan, pals)
    const second = layoutBreedingPlan(plan, pals)
    expect(first.nodes.map((node) => node.position)).toEqual(
      second.nodes.map((node) => node.position),
    )
    expect(first.nodes.find((node) => node.id === 'child')?.position.y).toBeGreaterThan(
      first.nodes.find((node) => node.id === 'parent-a')?.position.y ?? 0,
    )
  })

  it('appends an independent recipe group and deletes a node with its relations', () => {
    const appended = appendRecipeToPlan(
      emptyPlan(),
      { recipeIndex: 0, parentAId: 'A', parentBId: 'B', childId: 'C' },
      {
        node: (() => {
          let index = 0
          return () => `node-${index++}`
        })(),
        relation: () => 'relation-1',
      },
      { validPalIds: new Set(['A', 'B', 'C']), breedingIndex: index },
    )
    expect(appended.nodes).toHaveLength(3)
    expect(appended.relations).toHaveLength(1)

    const deleted = deletePlanNodes(appended, new Set(['node-0']))
    expect(deleted.affectedRelations).toBe(1)
    expect(deleted.plan.nodes).toHaveLength(2)
    expect(deleted.plan.relations).toEqual([])
  })

  it('merges same-pal nodes and rejects merges that create invalid relations', () => {
    let base = addPalNode(emptyPlan(), 'A', 'preset', 'a-keep')
    base = addPalNode(base, 'A', 'preset', 'a-remove')
    base = addPalNode(base, 'B', 'preset', 'b')
    const merged = mergePalNodes(base, 'a-keep', 'a-remove', {
      validPalIds: new Set(['A', 'B', 'C']),
      breedingIndex: index,
    })
    expect(merged.nodes.map((node) => node.id)).toEqual(['a-keep', 'b'])

    expect(() =>
      mergePalNodes(base, 'a-keep', 'b', {
        validPalIds: new Set(['A', 'B', 'C']),
        breedingIndex: index,
      }),
    ).toThrow('同一帕鲁')
  })

  it('lays out 500 nodes within the acceptance budget', () => {
    const largePlan: BreedingPlanV1 = {
      ...emptyPlan(),
      nodes: Array.from({ length: 500 }, (_, index) => ({
        id: `node-${index.toString().padStart(3, '0')}`,
        palId: 'A',
        position: { x: 0, y: 0 },
        source: 'import' as const,
      })),
    }
    const startedAt = performance.now()
    const result = layoutBreedingPlan(largePlan, new Map([['A', pal('A', '001')]]))
    const elapsedMs = performance.now() - startedAt

    expect(result.nodes).toHaveLength(500)
    expect(elapsedMs).toBeLessThan(500)
  })
})
