import { describe, expect, it } from 'vitest'
import { buildBreedingGraph } from '../../domain/breeding-graph'
import type { BreedingRecipeMatch } from '../../domain/types'
import { layoutGraph } from './layout'

function componentFor(recipes: readonly BreedingRecipeMatch[], id = 'component-1') {
  return [{
    id,
    recipeIndexes: recipes.map((recipe) => recipe.recipeIndex),
    palIds: [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))],
  }]
}

describe('ELK breeding layout', () => {
  it('keeps parents above the recipe junction and offspring even when child ID sorts first', async () => {
    const recipes = [{
      recipeIndex: 44556,
      parentAId: 'CloverFairy',
      parentBId: 'CuteFox',
      childId: 'Carbunclo',
    }]
    const input = buildBreedingGraph(recipes, componentFor(recipes), 'merged')
    const request = { requestId: 1, ...input, viewport: { width: 1440, height: 900 } }
    const first = await layoutGraph(request)
    const second = await layoutGraph(request)
    const nodeById = new Map(first.nodes.map((node) => [node.id, node]))
    const junction = nodeById.get('recipe:44556')!
    const child = nodeById.get('pal:Carbunclo')!
    const parents = ['pal:CloverFairy', 'pal:CuteFox'].map((id) => nodeById.get(id)!)

    expect(second).toEqual(first)
    expect(first.nodes.every((node) => Number.isInteger(node.x) && Number.isInteger(node.y))).toBe(true)
    expect(parents.every((parent) => parent.y + parent.height < junction.y)).toBe(true)
    expect(junction.y + junction.height).toBeLessThan(child.y)
    expect(new Set(parents.map((parent) => parent.y))).toHaveLength(1)
    expect(first.edges.filter((edge) => edge.label)).toEqual([
      expect.objectContaining({ role: 'offspringOutput', recipeIndex: 44556 }),
    ])
    expect(first.edges.every((edge) => edge.points.length >= 2)).toBe(true)
  })

  it('packs stable connected components using the canvas width', async () => {
    const recipes = [
      { recipeIndex: 1, parentAId: 'A', parentBId: 'B', childId: 'C' },
      { recipeIndex: 2, parentAId: 'X', parentBId: 'Y', childId: 'Z' },
    ]
    const graph = buildBreedingGraph(recipes, [
      { id: 'component-a', recipeIndexes: [1], palIds: ['A', 'B', 'C'] },
      { id: 'component-b', recipeIndexes: [2], palIds: ['X', 'Y', 'Z'] },
    ], 'merged')
    const result = await layoutGraph({ requestId: 2, ...graph, viewport: { width: 800, height: 720 } })
    const bounds = ['component-a', 'component-b'].map((componentId) => {
      const nodes = result.nodes.filter((node) => node.componentId === componentId)
      return {
        minX: Math.min(...nodes.map((node) => node.x)),
        maxX: Math.max(...nodes.map((node) => node.x + node.width)),
        minY: Math.min(...nodes.map((node) => node.y)),
      }
    })

    expect(bounds[1].minY).toBeGreaterThanOrEqual(bounds[0].minY)
    expect(bounds[0].maxX <= bounds[1].minX || bounds[1].minY > bounds[0].minY).toBe(true)
  })

  it('lays out a genuine 500-relation graph within the graph budget', async () => {
    const recipes = Array.from({ length: 500 }, (_, recipeIndex) => ({
      recipeIndex,
      parentAId: recipeIndex === 0 ? 'Seed' : `C${recipeIndex - 1}`,
      parentBId: `B${recipeIndex}`,
      childId: `C${recipeIndex}`,
    }))
    const input = buildBreedingGraph(recipes, componentFor(recipes), 'merged')
    await layoutGraph({
      requestId: 499,
      nodes: input.nodes.slice(0, 3),
      edges: [],
      viewport: { width: 1440, height: 900 },
    })
    const start = performance.now()
    const result = await layoutGraph({ requestId: 500, ...input, viewport: { width: 1440, height: 900 } })

    // Dedicated runs stay below one second; allow scheduler contention when the
    // complete Vitest suite executes this CPU-heavy ELK case in parallel.
    expect(performance.now() - start).toBeLessThan(2500)
    expect(result.nodes).toHaveLength(1501)
    expect(result.edges).toHaveLength(1500)
  }, 10_000)
})
