import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createEmptyWorkspace, snapshotRecipe } from '../domain/breeding-workspace'
import {
  BreedingWorkspaceRepository,
  createWorkspaceExport,
  parseWorkspaceImport,
} from './breeding-workspace'

describe('BreedingWorkspaceRepository', () => {
  it('creates the fixed default plan and restores normalized records', async () => {
    const factory = new IDBFactory()
    const first = new BreedingWorkspaceRepository(factory)
    const initial = await first.load('v1')
    expect(initial.currentPlanId).toBe('default')
    const relation = snapshotRecipe({ recipeIndex: 7, parentAId: 'A', parentBId: 'B', childId: 'C' }, 'v1')
    const next = {
      ...initial,
      relations: [relation],
      planRelations: { default: [7] },
    }
    await first.commit(initial, next)
    first.close()

    const second = new BreedingWorkspaceRepository(factory)
    await expect(second.load('v1')).resolves.toMatchObject({
      relations: [{ recipeIndex: 7, inBag: true }],
      planRelations: { default: [7] },
    })
    second.close()
  })

  it('round-trips a complete export and preserves bag-only direct cycles', () => {
    const workspace = createEmptyWorkspace('v1')
    workspace.relations = [snapshotRecipe({ recipeIndex: 1, parentAId: 'A', parentBId: 'A', childId: 'A' }, 'v1')]
    const exported = createWorkspaceExport(workspace, '0.1.0', 'v1', '2026-08-10T00:00:00.000Z')
    expect(parseWorkspaceImport(JSON.parse(JSON.stringify(exported)))).toEqual(workspace)
  })

  it('rejects duplicate relations, missing defaults and cyclic plan imports', () => {
    const base = createEmptyWorkspace('v1')
    const first = snapshotRecipe({ recipeIndex: 1, parentAId: 'A', parentBId: 'B', childId: 'C' }, 'v1')
    const second = snapshotRecipe({ recipeIndex: 2, parentAId: 'C', parentBId: 'D', childId: 'A' }, 'v1')
    const validExport = createWorkspaceExport({ ...base, relations: [first, second] }, '0.1.0', 'v1')
    expect(() => parseWorkspaceImport({ ...validExport, relations: [first, first] })).toThrow('关系重复')
    expect(() => parseWorkspaceImport({ ...validExport, plans: [], planRelations: {} })).toThrow('默认方案')
    expect(() => parseWorkspaceImport({ ...validExport, planRelations: { default: [1, 2] } })).toThrow('循环关系')
  })

  it('replaces all stores atomically from the public repository boundary', async () => {
    const factory = new IDBFactory()
    const repository = new BreedingWorkspaceRepository(factory)
    const initial = await repository.load('v1')
    const replacement = createEmptyWorkspace('v2', '2026-08-10T00:00:00.000Z')
    replacement.preferences.lastView = 'relations'
    await repository.replace(replacement)
    expect(await repository.load('v2')).toMatchObject({ datasetVersion: 'v2', preferences: { lastView: 'relations' } })
    expect(initial.datasetVersion).toBe('v1')
    repository.close()
  })
})
