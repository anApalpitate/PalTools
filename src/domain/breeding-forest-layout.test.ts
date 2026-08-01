import { describe, expect, it } from 'vitest'
import type { BreedingPlanV1 } from './breeding-graph'
import {
  computeForestLayout,
  createForestLayoutEngine,
} from './breeding-forest-layout'
import type { PalRecord } from './types'

const timestamp = '2026-08-01T00:00:00.000Z'

function plan(nodeCount = 0): BreedingPlanV1 {
  return {
    id: 'plan-1',
    schemaVersion: 1,
    name: '方案',
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      id: `node-${index}`,
      palId: `pal-${index % 3}`,
      source: 'manual' as const,
      position: { x: 999, y: 999 },
    })),
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function pal(id: string, paldexNo: string): PalRecord {
  return {
    internalId: id,
    paldbId: id,
    paldexNo,
    name: { zhHans: id, en: id },
    elements: ['neutral'],
    rarity: 1,
    workSuitabilities: {},
    partnerSkill: null,
    stats: {
      hp: 1,
      attack: 1,
      defense: 1,
      workSpeed: 1,
      walkSpeed: 1,
      runSpeed: 1,
      swimSpeed: 1,
      rideSprintSpeed: 1,
      transportSpeed: 1,
      stamina: 1,
      foodAmount: 1,
    },
    statSources: {},
    activeSkills: [],
    passiveSkills: [],
    drops: [],
    image: { localPath: '', sourceUrl: '', sha256: 'a'.repeat(64) },
    sourceUrl: '',
  }
}

const pals = new Map([
  ['pal-0', pal('pal-0', '001')],
  ['pal-1', pal('pal-1', '002')],
  ['pal-2', pal('pal-2', '003')],
])

describe('breeding forest layout', () => {
  it('places parents above their child and emits two relation edges', () => {
    const input = plan(3)
    input.relations.push({
      id: 'relation-1',
      parentANodeId: 'node-0',
      parentBNodeId: 'node-1',
      childNodeId: 'node-2',
      recipeIndex: 0,
    })
    const layout = computeForestLayout(input, pals)

    expect(layout.nodeById.get('node-2')?.level).toBe(1)
    expect(layout.nodeById.get('node-2')!.y).toBeGreaterThan(
      layout.nodeById.get('node-0')!.y,
    )
    expect(layout.edges).toHaveLength(2)
  })

  it('supports shared parents and same-pal double-parent instances', () => {
    const input = plan(5)
    input.nodes[0].palId = 'pal-0'
    input.nodes[1].palId = 'pal-0'
    input.relations.push(
      {
        id: 'relation-1',
        parentANodeId: 'node-0',
        parentBNodeId: 'node-1',
        childNodeId: 'node-2',
        recipeIndex: 0,
      },
      {
        id: 'relation-2',
        parentANodeId: 'node-0',
        parentBNodeId: 'node-3',
        childNodeId: 'node-4',
        recipeIndex: 1,
      },
    )

    const layout = computeForestLayout(input, pals)
    expect(layout.nodeById.get('node-0')?.componentId).toBe(
      layout.nodeById.get('node-4')?.componentId,
    )
    expect(layout.nodeById.get('node-2')?.level).toBe(1)
    expect(layout.nodeById.get('node-4')?.level).toBe(1)
    expect(layout.edges).toHaveLength(4)
  })

  it('packs independent recipe trees as separate components', () => {
    const input = plan(6)
    input.relations.push(
      {
        id: 'relation-1',
        parentANodeId: 'node-0',
        parentBNodeId: 'node-1',
        childNodeId: 'node-2',
        recipeIndex: 0,
      },
      {
        id: 'relation-2',
        parentANodeId: 'node-3',
        parentBNodeId: 'node-4',
        childNodeId: 'node-5',
        recipeIndex: 1,
      },
    )
    const layout = computeForestLayout(input, pals)

    expect(new Set(layout.nodes.map((node) => node.componentId)).size).toBe(2)
    expect(layout.nodeById.get('node-0')?.componentId).not.toBe(
      layout.nodeById.get('node-3')?.componentId,
    )
  })

  it('keeps disconnected roots in deterministic shelf slots', () => {
    const first = computeForestLayout(plan(30), pals)
    const second = computeForestLayout(plan(30), pals)
    expect(first.nodes).toEqual(second.nodes)
    expect(new Set(first.nodes.map((node) => `${node.x}|${node.y}`)).size).toBe(30)
    expect(first.bounds?.height).toBeGreaterThan(72)
  })

  it('reuses unchanged component layouts', () => {
    const engine = createForestLayoutEngine()
    const input = plan(4)
    engine.compute(input, pals)
    const changed = {
      ...input,
      nodes: [...input.nodes, {
        id: 'node-new',
        palId: 'pal-0',
        source: 'manual' as const,
        position: { x: 0, y: 0 },
      }],
    }
    engine.compute(changed, pals)

    expect(engine.getCacheStats()).toEqual({ hits: 4, misses: 5 })
  })

  it.each([100, 300, 500])('lays out %i roots within the performance budget', (count) => {
    const startedAt = performance.now()
    const layout = computeForestLayout(plan(count), pals)
    const elapsed = performance.now() - startedAt
    expect(layout.nodes).toHaveLength(count)
    expect(elapsed).toBeLessThan(500)
  })
})
