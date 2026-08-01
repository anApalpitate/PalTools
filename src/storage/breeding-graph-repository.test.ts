import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'
import type { BreedingPlanV2, PalPresetV1 } from '../domain/breeding-graph'
import { BREEDING_GRAPH_DB_NAME, BREEDING_GRAPH_DB_VERSION, IndexedDbBreedingGraphRepository } from './breeding-graph-repository'

const timestamp = '2026-08-01T00:00:00.000Z'
let repository: IndexedDbBreedingGraphRepository | undefined
let factory: IDBFactory

afterEach(async () => { await repository?.close(); repository = undefined })
function createRepository() { factory = new IDBFactory(); repository = new IndexedDbBreedingGraphRepository(factory); return repository }
function preset(id = 'preset-1'): PalPresetV1 { return { id, schemaVersion: 1, name: '常用', palIds: ['A'], createdAt: timestamp, updatedAt: timestamp } }
function plan(): BreedingPlanV2 {
  return {
    id: 'plan-1', schemaVersion: 2, name: '方案一', layers: [{ nodeIds: ['a', 'b'] }, { nodeIds: ['c'] }],
    nodes: [{ id: 'a', palId: 'A', source: 'import' }, { id: 'b', palId: 'B', source: 'import' }, { id: 'c', palId: 'C', source: 'child' }],
    relations: [{ id: 'r', parentANodeId: 'a', parentBNodeId: 'b', childNodeId: 'c', recipeIndex: 0 }],
    viewport: { x: 0, y: 0, zoom: 1 }, createdAt: timestamp, updatedAt: timestamp,
  }
}

describe('IndexedDbBreedingGraphRepository', () => {
  it('creates v2 stores and persists a layered plan', async () => {
    const repo = createRepository()
    await repo.putPreset(preset())
    await repo.putPlan(plan())
    expect(await repo.getPlan('plan-1')).toEqual(plan())
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(BREEDING_GRAPH_DB_NAME, BREEDING_GRAPH_DB_VERSION)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect([...db.objectStoreNames]).toEqual(['metadata', 'plan-preset-links', 'plans', 'presets'])
    db.close()
  })

  it('rejects a v1-shaped plan instead of writing it', async () => {
    const repo = createRepository()
    await expect(repo.putPlan({ id: 'old', schemaVersion: 1 } as never)).rejects.toBeTruthy()
    expect(await repo.listPlans()).toEqual([])
  })

  it('writes and reads workspace selection independently', async () => {
    const repo = createRepository()
    expect(await repo.readWorkspaceSelection()).toEqual({ currentPresetId: null, currentPlanId: null })
    await repo.saveWorkspaceSelection({ currentPresetId: 'preset-1', currentPlanId: 'plan-1' })
    expect(await repo.readWorkspaceSelection()).toEqual({ currentPresetId: 'preset-1', currentPlanId: 'plan-1' })
  })

  it('stores many-to-many links atomically with a plan', async () => {
    const repo = createRepository()
    await repo.putPreset(preset('preset-1'))
    await repo.putPreset(preset('preset-2'))
    await repo.savePlanBundle(plan(), [
      { planId: 'plan-1', presetId: 'preset-1', lastUsedAt: timestamp },
      { planId: 'plan-1', presetId: 'preset-2', lastUsedAt: timestamp },
    ])
    expect(await repo.listLinks()).toHaveLength(2)
    expect(await repo.listPlans()).toEqual([plan()])
  })
})
