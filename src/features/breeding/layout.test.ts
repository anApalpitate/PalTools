import { describe, expect, it } from 'vitest'
import { layoutGraph, recipeIndexesForTarget } from './layout'

describe('ELK breeding layout', () => {
  it('returns deterministic integer coordinates for stable input', async () => {
    const request = {
      requestId: 1,
      nodeMode: 'merged' as const,
      viewport: { width: 1440, height: 900 },
      nodes: [
        { id: 'pal:A', kind: 'pal' as const, label: 'A', palId: 'A', componentId: 'component-1', width: 150, height: 64 },
        { id: 'recipe:1', kind: 'recipe' as const, label: '配方 #1', recipeIndex: 1, componentId: 'component-1', width: 104, height: 48 },
        { id: 'pal:B', kind: 'pal' as const, label: 'B', palId: 'B', componentId: 'component-1', width: 150, height: 64 },
      ],
      edges: [
        { id: 'edge:1:a', source: 'pal:A', target: 'recipe:1', role: 'parentA' as const, recipeIndex: 1 },
        { id: 'edge:1:c', source: 'recipe:1', target: 'pal:B', role: 'child' as const, recipeIndex: 1 },
      ],
    }
    const first = await layoutGraph(request)
    const second = await layoutGraph(request)
    expect(second).toEqual(first)
    expect(first.nodes.every((node) => Number.isInteger(node.x) && Number.isInteger(node.y))).toBe(true)
  })

  it('lays out a 500-relation fixture within the graph budget', async () => {
    const recipes = Array.from({ length: 500 }, (_, recipeIndex) => ({
      recipeIndex,
      parentAId: `A${recipeIndex}`,
      parentBId: `B${recipeIndex}`,
      childId: `C${recipeIndex}`,
    }))
    const visible = recipeIndexesForTarget(recipes, 'C0')
    const nodes = [
      { id: 'pal:A0', kind: 'pal' as const, label: 'A0', palId: 'A0', componentId: 'component-1', width: 150, height: 64 },
      { id: 'pal:B0', kind: 'pal' as const, label: 'B0', palId: 'B0', componentId: 'component-1', width: 150, height: 64 },
      { id: 'recipe:0', kind: 'recipe' as const, label: '配方 #0', recipeIndex: 0, componentId: 'component-1', width: 104, height: 48 },
      { id: 'pal:C0', kind: 'pal' as const, label: 'C0', palId: 'C0', componentId: 'component-1', width: 150, height: 64 },
    ]
    const edges = [
      { id: 'edge:0:a', source: 'pal:A0', target: 'recipe:0', role: 'parentA' as const, recipeIndex: 0 },
      { id: 'edge:0:b', source: 'pal:B0', target: 'recipe:0', role: 'parentB' as const, recipeIndex: 0 },
      { id: 'edge:0:c', source: 'recipe:0', target: 'pal:C0', role: 'child' as const, recipeIndex: 0 },
    ]
    const start = performance.now()
    const result = await layoutGraph({ requestId: 500, nodes, edges, nodeMode: 'merged', viewport: { width: 1440, height: 900 } })
    expect(performance.now() - start).toBeLessThan(1000)
    expect(visible).toEqual(new Set([0]))
    expect(result.nodes).toHaveLength(4)
  })
})
