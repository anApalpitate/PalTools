import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  BreedingPlanV1,
  PalPresetV1,
} from '../domain/breeding-graph'
import {
  BREEDING_GRAPH_DB_NAME,
  BREEDING_GRAPH_DB_VERSION,
  IndexedDbBreedingGraphRepository,
} from './breeding-graph-repository'

const timestamp = '2026-07-30T08:00:00.000Z'
let factory: IDBFactory
let repository: IndexedDbBreedingGraphRepository | undefined

afterEach(async () => {
  await repository?.close()
  repository = undefined
})

function createRepository() {
  factory = new IDBFactory()
  repository = new IndexedDbBreedingGraphRepository(factory)
  return repository
}

function preset(id = 'preset-1'): PalPresetV1 {
  return {
    id,
    schemaVersion: 1,
    name: '常用背包',
    palIds: ['A', 'B'],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function plan(): BreedingPlanV1 {
  return {
    id: 'plan-1',
    schemaVersion: 1,
    name: '方案一',
    nodes: [
      {
        id: 'node-a',
        palId: 'A',
        position: { x: 0, y: 0 },
        source: 'preset',
      },
      {
        id: 'node-b',
        palId: 'B',
        position: { x: 100, y: 0 },
        source: 'preset',
      },
      {
        id: 'node-c',
        palId: 'C',
        position: { x: 50, y: 100 },
        source: 'manual-child',
      },
    ],
    relations: [
      {
        id: 'relation-1',
        parentANodeId: 'node-a',
        parentBNodeId: 'node-b',
        childNodeId: 'node-c',
        recipeIndex: 0,
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('IndexedDbBreedingGraphRepository', () => {
  it('creates the versioned stores and persists presets', async () => {
    const repo = createRepository()
    await repo.putPreset(preset())

    expect(await repo.listPresets()).toEqual([preset()])
    const request = factory.open(
      BREEDING_GRAPH_DB_NAME,
      BREEDING_GRAPH_DB_VERSION,
    )
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect([...db.objectStoreNames]).toEqual([
      'metadata',
      'plan-preset-links',
      'plans',
      'presets',
    ])
    db.close()
  })

  it('writes a plan and its many-to-many links in one repository operation', async () => {
    const repo = createRepository()
    await repo.putPreset(preset('preset-1'))
    await repo.putPreset(preset('preset-2'))
    await repo.savePlanBundle(plan(), [
      {
        planId: 'plan-1',
        presetId: 'preset-1',
        lastUsedAt: timestamp,
      },
      {
        planId: 'plan-1',
        presetId: 'preset-2',
        lastUsedAt: timestamp,
      },
    ])

    expect(await repo.getPlan('plan-1')).toEqual(plan())
    expect(await repo.listLinks()).toHaveLength(2)
  })

  it('migrates valid legacy IDs exactly once without deleting the source payload', async () => {
    const repo = createRepository()
    const raw = JSON.stringify({
      schemaVersion: 1,
      palIds: ['B', 'missing', 'A', 'B'],
    })
    const options = {
      raw,
      validPalIds: new Set(['A', 'B']),
      now: () => new Date(timestamp),
      createId: () => 'migrated-preset',
    }

    await expect(repo.migrateLegacyOwnedPals(options)).resolves.toEqual({
      status: 'migrated',
      presetId: 'migrated-preset',
      palCount: 2,
    })
    await expect(repo.migrateLegacyOwnedPals(options)).resolves.toEqual({
      status: 'already-migrated',
      presetId: 'migrated-preset',
      palCount: 0,
    })
    expect(await repo.listPresets()).toEqual([
      {
        id: 'migrated-preset',
        schemaVersion: 1,
        name: '旧版已有帕鲁',
        palIds: ['A', 'B'],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])
    expect(raw).toContain('"B"')
  })

  it('uses a suffix when the legacy preset name already exists', async () => {
    const repo = createRepository()
    await repo.putPreset({
      ...preset(),
      name: '旧版已有帕鲁',
    })

    await repo.migrateLegacyOwnedPals({
      raw: '{"schemaVersion":1,"palIds":["A"]}',
      validPalIds: new Set(['A']),
      now: () => new Date(timestamp),
      createId: () => 'migrated-preset',
    })

    expect((await repo.getPreset('migrated-preset'))?.name).toBe(
      '旧版已有帕鲁（2）',
    )
  })

  it('rejects an invalid cyclic plan before writing it', async () => {
    const repo = createRepository()
    const invalid = plan()
    invalid.relations.push({
      id: 'relation-2',
      parentANodeId: 'node-c',
      parentBNodeId: 'node-b',
      childNodeId: 'node-a',
      recipeIndex: 0,
    })

    await expect(repo.putPlan(invalid)).rejects.toThrow('有向无环图')
    expect(await repo.listPlans()).toEqual([])
  })

  it('aborts a bundle when a linked preset does not exist', async () => {
    const repo = createRepository()

    await expect(
      repo.savePlanBundle(plan(), [
        {
          planId: 'plan-1',
          presetId: 'missing-preset',
          lastUsedAt: timestamp,
        },
      ]),
    ).rejects.toThrow('不存在')
    expect(await repo.listPlans()).toEqual([])
    expect(await repo.listLinks()).toEqual([])
  })

  it('persists and reads the workspace selection independently', async () => {
    const repo = createRepository()
    expect(await repo.readWorkspaceSelection()).toEqual({
      currentPresetId: null,
      currentPlanId: null,
    })

    await repo.saveWorkspaceSelection({
      currentPresetId: 'preset-2',
      currentPlanId: 'plan-3',
    })
    expect(await repo.readWorkspaceSelection()).toEqual({
      currentPresetId: 'preset-2',
      currentPlanId: 'plan-3',
    })
  })

  it('imports a new plan and selects it atomically without preset links', async () => {
    const repo = createRepository()
    await repo.putPreset(preset())
    await repo.importPlan(plan(), {
      currentPresetId: 'preset-1',
      currentPlanId: 'plan-1',
    })

    expect(await repo.getPlan('plan-1')).toEqual(plan())
    expect(await repo.readWorkspaceSelection()).toEqual({
      currentPresetId: 'preset-1',
      currentPlanId: 'plan-1',
    })
    expect(await repo.listLinks()).toEqual([])

    await expect(repo.importPlan(plan(), {
      currentPresetId: 'preset-1',
      currentPlanId: 'plan-1',
    })).rejects.toBeTruthy()
    expect(await repo.listPlans()).toHaveLength(1)
  })

  it('writes many-to-many links without touching plans or presets', async () => {
    const repo = createRepository()
    await repo.putPreset(preset('preset-1'))
    await repo.putPreset(preset('preset-2'))
    await repo.saveLinks([
      { planId: 'plan-1', presetId: 'preset-1', lastUsedAt: timestamp },
      { planId: 'plan-1', presetId: 'preset-2', lastUsedAt: timestamp },
    ])

    expect(await repo.listLinks()).toHaveLength(2)
    await repo.saveLinks([
      { planId: 'plan-1', presetId: 'preset-2', lastUsedAt: timestamp },
    ])
    expect(await repo.listLinks()).toHaveLength(1)
    expect(await repo.listPlans()).toEqual([])
  })
})
