import { describe, expect, it } from 'vitest'
import {
  addChildRelation,
  addPalNode,
  layoutBreedingPlan,
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
})
