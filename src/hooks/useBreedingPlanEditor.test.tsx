// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BreedingPlanV2 } from '../domain/breeding-graph'
import type { BreedingIndexPayload, PalRecord } from '../domain/types'
import { deriveLayeredSlots } from '../domain/breeding-layered-graph'
import { useBreedingPlanEditor } from './useBreedingPlanEditor'

function pal(id: string): PalRecord {
  return {
    internalId: id, paldbId: id, paldexNo: id, name: { zhHans: id, en: id }, elements: ['neutral'], rarity: 1,
    workSuitabilities: {}, partnerSkill: null,
    stats: { hp: 1, attack: 1, defense: 1, workSpeed: 1, walkSpeed: 1, runSpeed: 1, swimSpeed: 1, rideSprintSpeed: 1, transportSpeed: 1, stamina: 1, foodAmount: 1 },
    statSources: {}, activeSkills: [], passiveSkills: [], drops: [],
    image: { localPath: '', sourceUrl: '', sha256: 'a'.repeat(64) }, sourceUrl: '',
  }
}

const pals = ['A', 'B', 'C'].map(pal)
const index: BreedingIndexPayload = {
  schemaVersion: 4, palIds: ['A', 'B', 'C'], recipes: [[0, 1, 2]],
  recipesByPair: { '0|1': [0] }, parentsByChild: { '2': [0] },
}
const timestamp = '2026-08-01T00:00:00.000Z'

function plan(nodes: BreedingPlanV2['nodes'] = [], layers: string[][] = []): BreedingPlanV2 {
  return { id: 'plan-1', schemaVersion: 2, name: '方案 1', layers: layers.map((nodeIds) => ({ nodeIds })), nodes, relations: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: timestamp, updatedAt: timestamp }
}

describe('useBreedingPlanEditor', () => {
  it('adds the first node immediately and enters placement mode afterwards', () => {
    const { result } = renderHook(() => useBreedingPlanEditor({ plan: plan(), pals, breedingIndex: index, savePlan: vi.fn(async () => true) }))
    act(() => result.current.actions.addManualNode('A'))
    expect(result.current.state.plan?.nodes).toHaveLength(1)
    act(() => result.current.actions.addManualNode('B'))
    expect(result.current.state.placementPalId).toBe('B')
    expect(result.current.state.plan?.nodes).toHaveLength(1)
  })

  it('places a node into a legal slot and tracks reveal/focus', () => {
    const first = { id: 'a', palId: 'A', source: 'manual' as const }
    const { result } = renderHook(() => useBreedingPlanEditor({ plan: plan([first], [['a']]), pals, breedingIndex: index, savePlan: vi.fn(async () => true) }))
    const slot = deriveLayeredSlots(result.current.state.plan!)[0]
    act(() => result.current.actions.placeManualNode('B', slot))
    expect(result.current.state.plan?.nodes.map((node) => node.palId)).toEqual(['A', 'B'])
    expect(result.current.state.focusedNodeId).toBe(result.current.state.revealNodeId)
  })

  it('creates a child relation and recursively deletes its descendants', () => {
    const first = { id: 'a', palId: 'A', source: 'manual' as const }
    const second = { id: 'b', palId: 'B', source: 'manual' as const }
    const { result } = renderHook(() => useBreedingPlanEditor({ plan: plan([first, second], [['a', 'b']]), pals, breedingIndex: index, savePlan: vi.fn(async () => true) }))
    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.plan?.relations).toHaveLength(1)
    const childId = result.current.state.plan?.relations[0].childNodeId
    act(() => result.current.actions.setSelectedNodeIds(['a']))
    act(() => result.current.actions.deleteSelected())
    expect(result.current.state.plan?.nodes.some((node) => node.id === childId)).toBe(false)
    expect(result.current.state.plan?.relations).toHaveLength(0)
  })

  it('saves viewport changes without marking structure dirty', async () => {
    const savePlan = vi.fn(async () => true)
    const first = { id: 'a', palId: 'A', source: 'manual' as const }
    const { result } = renderHook(() => useBreedingPlanEditor({ plan: plan([first], [['a']]), pals, breedingIndex: index, savePlan }))
    act(() => result.current.actions.setViewport({ x: 20, y: 30, zoom: 1.2 }))
    expect(result.current.state.viewportPending).toBe(true)
    expect(result.current.state.dirty).toBe(false)
    await act(async () => { await result.current.actions.flush() })
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({ viewport: { x: 20, y: 30, zoom: 1.2 } })))
  })
})
