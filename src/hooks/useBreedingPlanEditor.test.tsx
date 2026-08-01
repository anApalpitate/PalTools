// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BreedingPlanV1 } from '../domain/breeding-graph'
import type { BreedingIndexPayload, PalRecord } from '../domain/types'
import { useBreedingPlanEditor } from './useBreedingPlanEditor'

const timestamp = '2026-08-01T00:00:00.000Z'

function pal(id: string, number: string): PalRecord {
  return {
    internalId: id,
    paldbId: id,
    paldexNo: number,
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

const pals = [pal('A', '001'), pal('B', '002'), pal('C', '003'), pal('D', '004')]
const index: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: pals.map((entry) => entry.internalId),
  recipes: [
    [0, 1, 2],
    [0, 1, 3],
  ],
  recipesByPair: { '0|1': [0] },
  parentsByChild: { '2': [0], '3': [1] },
}

function plan(nodes: BreedingPlanV1['nodes'] = []): BreedingPlanV1 {
  return {
    id: 'plan-1',
    schemaVersion: 1,
    name: '方案 1',
    nodes,
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('useBreedingPlanEditor', () => {
  it('adds duplicate manual nodes and auto-saves after 500ms', async () => {
    const savePlan = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: plan(),
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => {
      result.current.actions.addManualNode('A')
      result.current.actions.addManualNode('A')
    })
    expect(result.current.state.plan?.nodes).toHaveLength(2)
    expect(result.current.state.plan?.nodes.every((node) => node.palId === 'A')).toBe(true)

    await waitFor(() => expect(savePlan).toHaveBeenCalled(), { timeout: 1500 })
    expect(savePlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan-1' }),
    )
    expect(result.current.state.plan?.nodes.every((node) => node.source === 'manual')).toBe(true)
    await waitFor(() => expect(result.current.state.saveState).toBe('saved'))
  })

  it('creates a unique child and exposes multiple or missing recipe states', () => {
    const basePlan = plan([
      { id: 'a', palId: 'A', source: 'preset', position: { x: 0, y: 0 } },
      { id: 'b', palId: 'B', source: 'preset', position: { x: 200, y: 0 } },
    ])
    const savePlan = vi.fn().mockResolvedValue(true)
    const { result, rerender } = renderHook(
      ({ breedingIndex }) =>
        useBreedingPlanEditor({
          plan: basePlan,
          pals,
          breedingIndex,
          savePlan,
        }),
      { initialProps: { breedingIndex: index } },
    )

    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.plan?.relations).toHaveLength(1)
    expect(result.current.state.plan?.nodes.at(-1)?.palId).toBe('C')

    const multiIndex = { ...index, recipesByPair: { '0|1': [0, 1] } }
    rerender({ breedingIndex: multiIndex })
    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.recipeChoices).toHaveLength(2)

    const noMatchIndex = { ...index, recipesByPair: {} }
    rerender({ breedingIndex: noMatchIndex })
    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.error).toBe('当前组合没有正式配方。')
  })

  it('keeps a dirty draft and exposes an error when persistence fails', async () => {
    const savePlan = vi.fn().mockResolvedValue(false)
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: plan(),
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => result.current.actions.addManualNode('A'))
    await act(async () => {
      expect(await result.current.actions.flush()).toBe(false)
    })
    expect(result.current.state.dirty).toBe(true)
    expect(result.current.state.saveState).toBe('error')
    expect(result.current.state.plan?.nodes).toHaveLength(1)
  })

  it('appends recipes and supports merge, delete, undo and redo history', () => {
    const savePlan = vi.fn().mockResolvedValue(true)
    const basePlan = plan([
      { id: 'a-keep', palId: 'A', source: 'preset', position: { x: 0, y: 0 } },
      { id: 'a-remove', palId: 'A', source: 'preset', position: { x: 100, y: 0 } },
    ])
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: basePlan,
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => result.current.actions.setSelectedNodeIds(['a-keep', 'a-remove']))
    act(() => result.current.actions.mergeSelected())
    expect(result.current.state.plan?.nodes).toHaveLength(1)
    expect(result.current.state.canUndo).toBe(true)

    act(() => result.current.actions.undo())
    expect(result.current.state.plan?.nodes).toHaveLength(2)
    expect(result.current.state.canRedo).toBe(true)
    act(() => result.current.actions.redo())
    expect(result.current.state.plan?.nodes).toHaveLength(1)

    act(() =>
      result.current.actions.appendRecipe({
        recipeIndex: 0,
        parentAId: 'A',
        parentBId: 'B',
        childId: 'C',
      }),
    )
    expect(result.current.state.plan?.nodes).toHaveLength(4)
    expect(result.current.state.plan?.relations).toHaveLength(1)

    act(() => result.current.actions.setSelectedNodeIds(['a-keep']))
    act(() => result.current.actions.deleteSelected())
    expect(result.current.state.plan?.nodes.some((node) => node.id === 'a-keep')).toBe(false)
  })
})
