import { describe, expect, it } from 'vitest'
import { buildBreedingGraph, recipeIndexesForTarget } from './breeding-graph'
import type { BreedingRecipeMatch } from './types'

const components = [{
  id: 'component-1',
  recipeIndexes: [10, 11],
  palIds: ['A', 'B', 'C', 'D', 'E'],
}]

describe('breeding graph domain', () => {
  it('builds deterministic graph inputs without mutating recipe order', () => {
    const recipes: BreedingRecipeMatch[] = [
      { recipeIndex: 11, parentAId: 'C', parentBId: 'D', childId: 'E' },
      { recipeIndex: 10, parentAId: 'B', parentBId: 'A', childId: 'C' },
    ]
    const original = structuredClone(recipes)
    const first = buildBreedingGraph(recipes, components, 'merged')
    const second = buildBreedingGraph([...recipes].reverse(), components, 'merged')

    expect(first).toEqual(second)
    expect(recipes).toEqual(original)
    expect(first.nodes.map((node) => node.id)).toEqual([...first.nodes.map((node) => node.id)].sort())
    expect(first.edges.map((edge) => edge.id)).toEqual([...first.edges.map((edge) => edge.id)].sort())
  })

  it('treats swapped parents as equivalent in merged and instance modes', () => {
    const forward = { recipeIndex: 10, parentAId: 'A', parentBId: 'B', childId: 'C' }
    const swapped = { ...forward, parentAId: 'B', parentBId: 'A' }

    expect(buildBreedingGraph([forward], components, 'merged'))
      .toEqual(buildBreedingGraph([swapped], components, 'merged'))
    expect(buildBreedingGraph([forward], components, 'instance'))
      .toEqual(buildBreedingGraph([swapped], components, 'instance'))
  })

  it('collapses self breeding to one anchored relationship edge', () => {
    const recipe = { recipeIndex: 10, parentAId: 'A', parentBId: 'A', childId: 'C' }
    for (const mode of ['merged', 'instance'] as const) {
      const graph = buildBreedingGraph([recipe], components, mode)
      const relationshipEdges = graph.edges.filter((edge) => edge.recipeIndex === recipe.recipeIndex)
      expect(relationshipEdges).toEqual([
        expect.objectContaining({ role: 'parents', actionAnchor: true }),
      ])
    }
  })

  it('selects the complete stable ancestor closure for a target', () => {
    const recipes: BreedingRecipeMatch[] = [
      { recipeIndex: 12, parentAId: 'X', parentBId: 'Y', childId: 'Z' },
      { recipeIndex: 11, parentAId: 'C', parentBId: 'D', childId: 'E' },
      { recipeIndex: 10, parentAId: 'A', parentBId: 'B', childId: 'C' },
    ]

    expect(recipeIndexesForTarget(recipes, 'E')).toEqual(new Set([11, 10]))
    expect(recipeIndexesForTarget(recipes, 'Z')).toEqual(new Set([12]))
  })
})
