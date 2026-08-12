import { describe, expect, it } from 'vitest'
import { buildBreedingGraph, projectBreedingGraph, recipeIndexesForTarget } from './breeding-graph'
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

  it('models a recipe as two parent inputs, one junction, and one offspring output', () => {
    const recipe = { recipeIndex: 44556, parentAId: 'CloverFairy', parentBId: 'CuteFox', childId: 'Carbunclo' }
    const graph = buildBreedingGraph([recipe], [{
      id: 'component-44556',
      recipeIndexes: [44556],
      palIds: ['Carbunclo', 'CloverFairy', 'CuteFox'],
    }], 'merged')

    expect(graph.nodes.filter((node) => node.kind === 'pal')).toHaveLength(3)
    expect(graph.nodes.filter((node) => node.kind === 'recipeJunction')).toEqual([
      expect.objectContaining({ id: 'recipe:44556', recipeIndex: 44556 }),
    ])
    expect(graph.edges.filter((edge) => edge.role === 'parentInput')).toHaveLength(2)
    expect(graph.edges.filter((edge) => edge.role === 'offspringOutput')).toEqual([
      expect.objectContaining({ source: 'recipe:44556', target: 'pal:Carbunclo', recipeIndex: 44556 }),
    ])
  })

  it('treats swapped parents as equivalent in merged and instance modes', () => {
    const forward = { recipeIndex: 10, parentAId: 'A', parentBId: 'B', childId: 'C' }
    const swapped = { ...forward, parentAId: 'B', parentBId: 'A' }

    expect(buildBreedingGraph([forward], components, 'merged'))
      .toEqual(buildBreedingGraph([swapped], components, 'merged'))
    expect(buildBreedingGraph([forward], components, 'instance'))
      .toEqual(buildBreedingGraph([swapped], components, 'instance'))
  })

  it('collapses self breeding to one doubled parent input and one output', () => {
    const recipe = { recipeIndex: 10, parentAId: 'A', parentBId: 'A', childId: 'C' }
    for (const mode of ['merged', 'instance'] as const) {
      const graph = buildBreedingGraph([recipe], components, mode)
      expect(graph.edges.filter((edge) => edge.role === 'parentInput')).toEqual([
        expect.objectContaining({ multiplicity: 2, recipeIndex: 10 }),
      ])
      expect(graph.edges.filter((edge) => edge.role === 'offspringOutput')).toHaveLength(1)
    }
  })

  it('projects a target closure without leaving orphan nodes', () => {
    const recipes: BreedingRecipeMatch[] = [
      { recipeIndex: 11, parentAId: 'C', parentBId: 'D', childId: 'E' },
      { recipeIndex: 10, parentAId: 'A', parentBId: 'B', childId: 'C' },
    ]
    const graph = buildBreedingGraph(recipes, components, 'instance')
    const projected = projectBreedingGraph(graph, new Set([11]))
    const connected = new Set(projected.edges.flatMap((edge) => [edge.source, edge.target]))

    expect(projected.nodes.every((node) => connected.has(node.id))).toBe(true)
    expect(projected.nodes.some((node) => node.recipeIndex === 10)).toBe(false)
    expect(projected.edges.every((edge) => edge.recipeIndex === 11)).toBe(true)
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
