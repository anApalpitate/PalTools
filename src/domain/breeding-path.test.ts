import { describe, expect, it } from 'vitest'
import { planBreedingPath } from './breeding-path'
import type { BreedingIndexPayload } from './types'

const index: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['A', 'B', 'C', 'D', 'E'],
  recipes: [
    [0, 1, 2],
    [2, 1, 3],
    [0, 3, 4],
    [4, 1, 2],
  ],
  recipesByPair: {
    '0|1': [0],
    '1|2': [1],
    '0|3': [2],
    '1|4': [3],
  },
  parentsByChild: {
    '2': [0, 3],
    '3': [1],
    '4': [2],
  },
}

describe('breeding path planning', () => {
  it('returns generation zero for an owned target', () => {
    const result = planBreedingPath({
      index,
      startIds: ['A', 'B'],
      targetId: 'A',
      mode: 'minimum',
      maxDisplayGeneration: 6,
    })
    expect(result).toMatchObject({
      status: 'ok',
      minGeneration: 0,
      tree: { palId: 'A', generation: 0 },
    })
  })

  it('finds the minimum generation and exact tree', () => {
    const minimum = planBreedingPath({
      index,
      startIds: ['A', 'B'],
      targetId: 'D',
      mode: 'minimum',
      maxDisplayGeneration: 6,
    })
    expect(minimum.minGeneration).toBe(2)
    expect(minimum.tree?.parentA?.palId).toBe('C')

    const exact = planBreedingPath({
      index,
      startIds: ['A', 'B'],
      targetId: 'E',
      mode: 'exact',
      exactGeneration: 3,
      maxDisplayGeneration: 6,
    })
    expect(exact.status).toBe('ok')
    expect(exact.tree?.generation).toBe(3)
  })

  it('reports visualization overflow and unreachable targets', () => {
    expect(
      planBreedingPath({
        index,
        startIds: ['A', 'B'],
        targetId: 'E',
        mode: 'minimum',
        maxDisplayGeneration: 2,
      }),
    ).toMatchObject({ status: 'over-limit', minGeneration: 3, tree: null })
    expect(
      planBreedingPath({
        index,
        startIds: ['A'],
        targetId: 'E',
        mode: 'minimum',
        maxDisplayGeneration: 6,
      }).status,
    ).toBe('unreachable')
  })
})
