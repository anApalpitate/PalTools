import { describe, expect, it } from 'vitest'
import {
  createEmptyWorkspace,
  derivePlanGraph,
  detectRecipeCycle,
  filterAndSortBagRelations,
  formatPlanSteps,
  resolveWorkspaceRelations,
  snapshotRecipe,
} from './breeding-workspace'
import type { BreedingIndexPayload, PalRecord } from './types'

const index: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['A', 'B', 'C', 'D', 'E', 'F'],
  recipes: [[0, 1, 2], [2, 3, 4], [4, 5, 0], [0, 0, 0], [0, 3, 5]],
  recipesByPair: {},
  parentsByChild: {},
}
const recipes = index.recipes.map((_, recipeIndex) => {
  const [parentA, parentB, child] = index.recipes[recipeIndex]
  return { recipeIndex, parentAId: index.palIds[parentA], parentBId: index.palIds[parentB], childId: index.palIds[child] }
})
const pals = index.palIds.map((id, indexValue) => ({
  internalId: id, paldbId: id, paldexNo: String(indexValue + 1), name: { zhHans: `帕鲁${id}`, en: id },
  elements: ['neutral'], rarity: 1, workSuitabilities: {}, partnerSkill: null,
  stats: { hp: 1, attack: 1, defense: 1, workSpeed: 1, walkSpeed: 1, runSpeed: 1, swimSpeed: 1, rideSprintSpeed: 1, transportSpeed: 1, stamina: 1, foodAmount: 1 },
  statSources: {}, activeSkills: [], passiveSkills: [], drops: [],
  image: { localPath: '', sourceUrl: '', sha256: '' }, sourceUrl: '',
})) as PalRecord[]

describe('breeding workspace domain', () => {
  it('detects direct and cross-recipe cycles with stable recipe ids', () => {
    expect(detectRecipeCycle([recipes[3]])?.recipeIndexes).toEqual([3])
    expect(detectRecipeCycle(recipes.slice(0, 3))?.recipeIndexes).toEqual([0, 1, 2])
    expect(detectRecipeCycle([recipes[0], recipes[1]])).toBeNull()
  })

  it('resolves snapshot mismatches as invalid without rebinding', () => {
    const workspace = createEmptyWorkspace('old')
    workspace.relations = [snapshotRecipe(recipes[0], 'old'), { ...snapshotRecipe(recipes[1], 'old'), childId: 'changed' }]
    const resolved = resolveWorkspaceRelations(workspace, index)
    expect(resolved.map((item) => item.status)).toEqual(['valid', 'invalid'])
  })

  it('filters three identities and keeps deterministic bag sorting', () => {
    const workspace = createEmptyWorkspace('v1')
    workspace.relations = [
      snapshotRecipe(recipes[0], 'v1', '2026-01-01T00:00:00.000Z'),
      snapshotRecipe(recipes[4], 'v1', '2026-01-02T00:00:00.000Z'),
    ]
    const resolved = resolveWorkspaceRelations(workspace, index)
    const result = filterAndSortBagRelations(resolved, new Map(pals.map((pal) => [pal.internalId, pal])), new Set(), {
      query: '帕鲁f', onlyNotInPlan: false, excludeSelfBreeding: false, sortKey: 'addedAt', sortDirection: 'desc',
    })
    expect(result.map((item) => item.snapshot.recipeIndex)).toEqual([4])
  })

  it('derives stable components, topological steps and equivalent graph modes', () => {
    const workspace = createEmptyWorkspace('v1')
    workspace.relations = recipes.slice(0, 2).map((recipe) => snapshotRecipe(recipe, 'v1'))
    const resolved = resolveWorkspaceRelations(workspace, index)
    const merged = derivePlanGraph(resolved, [0, 1], 'merged')
    const instance = derivePlanGraph(resolved, [0, 1], 'instance')
    expect(merged.components).toHaveLength(1)
    expect(merged.components[0].targetIds).toEqual(['E'])
    expect(merged.steps.map((step) => step.recipe.recipeIndex)).toEqual([0, 1])
    expect(merged.steps[1].prerequisiteSteps).toEqual([1])
    expect(instance.validRelations.map((recipe) => recipe.recipeIndex)).toEqual([0, 1])
    expect(merged.nodes).toHaveLength(5)
    expect(merged.nodes.every((node) => node.kind === 'pal')).toBe(true)
    expect(merged.edges).toHaveLength(4)
    expect(merged.edges.every((edge) => edge.source.startsWith('pal:') && edge.target.startsWith('pal:'))).toBe(true)
    expect(instance.nodes).toHaveLength(11)
    expect(instance.nodes.some((node) => node.kind === 'junction')).toBe(true)
    expect(instance.nodes.some((node) => node.kind === 'occurrence')).toBe(true)
    expect(formatPlanSteps(merged, new Map(pals.map((pal) => [pal.internalId, pal])))).toContain('前置 1')
  })

  it('derives 500 relations under the domain response budget', () => {
    const largeRecipes = Array.from({ length: 500 }, (_, recipeIndex) => ({
      recipeIndex,
      parentAId: `A${recipeIndex}`,
      parentBId: `B${recipeIndex}`,
      childId: `C${recipeIndex}`,
    }))
    const resolved = largeRecipes.map((recipe) => ({ snapshot: snapshotRecipe(recipe, 'v1'), status: 'valid' as const, recipe }))
    const start = performance.now()
    const graph = derivePlanGraph(resolved, largeRecipes.map((recipe) => recipe.recipeIndex), 'merged')
    expect(performance.now() - start).toBeLessThan(300)
    expect(graph.validRelations).toHaveLength(500)
  })
})
