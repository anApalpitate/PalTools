import { describe, expect, it } from 'vitest'
import type { BreedingIndexPayload } from './types'
import { createChildRelation, createEmptyLayeredPlan, deleteLayeredNodes, deriveLayeredSlots, insertManualNode } from './breeding-layered-graph'

const index: BreedingIndexPayload = {
  schemaVersion: 4, palIds: ['A', 'B', 'C'], recipes: [[0, 1, 2]], recipesByPair: { '0|1': [0] }, parentsByChild: { '2': [0] },
}
const validPalIds = new Set(index.palIds)
const ids = (() => { let node = 0; let relation = 0; return { node: () => `n${++node}`, relation: () => `r${++relation}` } })

describe('breeding-layered-graph', () => {
  it('starts with one empty slot and preserves row order for insertion', () => {
    const empty = createEmptyLayeredPlan('p', '方案')
    expect(deriveLayeredSlots(empty)).toMatchObject([{ kind: 'empty', row: 0 }])
    const first = insertManualNode(empty, 'A', deriveLayeredSlots(empty)[0], 'a')
    const slot = deriveLayeredSlots(first).find((candidate) => candidate.direction === 'right')!
    const second = insertManualNode(first, 'B', slot, 'b')
    expect(second.layers).toEqual([{ nodeIds: ['a', 'b'] }])
  })

  it('creates adjacent child relations and protects their parent gap', () => {
    const base = insertManualNode(insertManualNode(createEmptyLayeredPlan('p', '方案'), 'A', deriveLayeredSlots(createEmptyLayeredPlan('p', '方案'))[0], 'a'), 'B', { id: 'insert-0-1', kind: 'insert', row: 0, index: 1, anchorNodeId: 'a', direction: 'right', label: '' }, 'b')
    const result = createChildRelation(base, 'a', 'b', { recipeIndex: 0, parentAId: 'A', parentBId: 'B', childId: 'C' }, ids(), { validPalIds, breedingIndex: index })
    expect(result.plan.layers[1].nodeIds).toHaveLength(1)
    expect(deriveLayeredSlots(result.plan).some((slot) => slot.row === 0 && slot.index === 1)).toBe(false)
  })

  it('deletes the complete descendant closure and its relations', () => {
    const plan = {
      ...createEmptyLayeredPlan('p', '方案'),
      layers: [{ nodeIds: ['a', 'b'] }, { nodeIds: ['c'] }, { nodeIds: ['d'] }],
      nodes: [{ id: 'a', palId: 'A', source: 'manual' as const }, { id: 'b', palId: 'B', source: 'manual' as const }, { id: 'c', palId: 'C', source: 'child' as const }, { id: 'd', palId: 'C', source: 'child' as const }],
      relations: [{ id: 'r1', parentANodeId: 'a', parentBNodeId: 'b', childNodeId: 'c', recipeIndex: 0 }, { id: 'r2', parentANodeId: 'a', parentBNodeId: 'c', childNodeId: 'd', recipeIndex: 0 }],
    }
    const result = deleteLayeredNodes(plan, new Set(['a']))
    expect(result.deletedNodeIds).toEqual(expect.arrayContaining(['a', 'c', 'd']))
    expect(result.plan.nodes.map((node) => node.id)).toEqual(['b'])
    expect(result.plan.relations).toEqual([])
  })
})
